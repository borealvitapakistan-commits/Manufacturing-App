from __future__ import annotations

from typing import Any

from services import db
from services.base_service import ServiceError
from services.converters import row_to_app

ITEM_TYPES = {"assembly", "raw_material", "encapsulation", "mixing", "label"}


class SentItemService:
    """Records goods sent out to a vendor (Assembly bottles, Raw Material,
    Encapsulation capsules, Mixing powder, or Labels), deducting the sent
    quantity from that entity's live inventory balance.

    Python resolves which underlying table/inventory item a given
    (itemType, sourceId) pair points to; the atomic write + inventory
    consumption/restoration happens in the save_sent_item/delete_sent_item
    Postgres functions (supabase/migrations-2/015_...sql), the same split
    used by AssemblyService/save_assembly.
    """

    TABLE = "sent_items"

    # -- source resolution ---------------------------------------------------

    @classmethod
    def resolve_source(cls, item_type: str, source_id: str) -> dict[str, Any]:
        if item_type not in ITEM_TYPES:
            raise ServiceError(f"Unknown item type: {item_type}", 400)
        resolver = {
            "assembly": cls._resolve_assembly,
            "raw_material": cls._resolve_raw_material,
            "encapsulation": cls._resolve_encapsulation,
            "mixing": cls._resolve_mixing,
            "label": cls._resolve_label,
        }[item_type]
        return resolver(source_id)

    @classmethod
    def list_sources(cls, item_type: str, brand_id: str | None = None) -> list[dict[str, Any]]:
        if item_type not in ITEM_TYPES:
            raise ServiceError(f"Unknown item type: {item_type}", 400)
        lister = {
            "assembly": cls._list_assembly_sources,
            "raw_material": cls._list_raw_material_sources,
            "encapsulation": cls._list_encapsulation_sources,
            "mixing": cls._list_mixing_sources,
            "label": cls._list_label_sources,
        }[item_type]
        return lister(brand_id)

    @staticmethod
    def _available_qty(inventory_item_id: str, inventory_lot_id: str | None = None) -> float:
        return db.as_float(
            db.get_inventory_quantity(
                inventory_item_id=inventory_item_id,
                inventory_lot_id=inventory_lot_id,
            )
        )

    # -- assembly (finished-goods bottles) ------------------------------------

    @classmethod
    def _assembly_lot_row(cls, lot_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("assembly_brand_lots")
                    .select("*, assemblies(assembly_code, batch_code, record_snapshot)")
                    .eq("id", lot_id)
                    .limit(1)
                )
            ),
            "Selected Assembly batch was not found.",
            404,
        )

    @classmethod
    def _assembly_entry(cls, row: dict[str, Any]) -> dict[str, Any] | None:
        item_id = row.get("finished_good_inventory_item_id")
        if not item_id:
            return None
        lot_id = row.get("finished_good_lot_id")
        available = cls._available_qty(str(item_id), str(lot_id) if lot_id else None)
        assembly = row.get("assemblies") or {}
        snapshot = assembly.get("record_snapshot") or {}
        item_name = snapshot.get("productName") or assembly.get("assembly_code") or "Assembly"
        # Batch Code (e.g. "M-MAG-011", sourced from the Encapsulation lot
        # number - see assemblies.batch_code in 014_...sql) is what the user
        # wants shown here, not assembly_brand_lots.batch_code (the
        # A-{brand}-{seq} assembly/lot code) - fall back to it only if a
        # legacy assembly never got a Batch Code backfilled.
        item_code = assembly.get("batch_code") or row.get("batch_code") or ""
        return {
            "id": str(row["id"]),
            "inventoryItemId": str(item_id),
            "itemName": item_name,
            "itemCode": item_code,
            "availableQty": available,
            "label": f"{item_code} - {item_name} ({int(available)} available)",
        }

    @classmethod
    def _resolve_assembly(cls, lot_id: str) -> dict[str, Any]:
        entry = cls._assembly_entry(cls._assembly_lot_row(lot_id))
        if not entry:
            raise ServiceError("Selected Assembly batch has no finished-goods inventory.", 400)
        return entry

    @classmethod
    def _list_assembly_sources(cls, brand_id: str | None) -> list[dict[str, Any]]:
        query = (
            db.client()
            .table("assembly_brand_lots")
            .select("*, assemblies(assembly_code, batch_code, record_snapshot)")
        )
        if brand_id:
            query = query.eq("brand_id", brand_id)
        rows = db.data(db.execute(query.order("created_at", desc=True).limit(200)))
        entries = [cls._assembly_entry(row) for row in rows]
        return [entry for entry in entries if entry and entry["availableQty"] > 0]

    # -- raw material ----------------------------------------------------------

    @classmethod
    def _raw_material_row(cls, inventory_item_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("raw_materials")
                    .select("*, inventory_items(item_code, item_name)")
                    .eq("inventory_item_id", inventory_item_id)
                    .limit(1)
                )
            ),
            "Selected Raw Material was not found.",
            404,
        )

    @classmethod
    def _raw_material_entry(cls, row: dict[str, Any]) -> dict[str, Any] | None:
        item_id = row.get("inventory_item_id") or row.get("id")
        if not item_id:
            return None
        available = cls._available_qty(str(item_id))
        inventory = row.get("inventory_items") or {}
        item_name = inventory.get("item_name") or "Raw Material"
        item_code = inventory.get("item_code") or ""
        return {
            "id": str(item_id),
            "inventoryItemId": str(item_id),
            "itemName": item_name,
            "itemCode": item_code,
            "availableQty": available,
            "label": f"{item_code} - {item_name} ({available} kg available)",
        }

    @classmethod
    def _resolve_raw_material(cls, inventory_item_id: str) -> dict[str, Any]:
        entry = cls._raw_material_entry(cls._raw_material_row(inventory_item_id))
        if not entry:
            raise ServiceError("Selected Raw Material has no inventory record.", 400)
        return entry

    @classmethod
    def _list_raw_material_sources(cls, brand_id: str | None) -> list[dict[str, Any]]:
        # Raw materials are not brand-scoped in this schema - brand_id is
        # ignored here and only recorded on the sent_items row itself.
        rows = db.data(
            db.execute(
                db.client()
                .table("raw_materials")
                .select("*, inventory_items(item_code, item_name)")
                .limit(500)
            )
        )
        entries = [cls._raw_material_entry(row) for row in rows]
        return [entry for entry in entries if entry and entry["availableQty"] > 0]

    # -- encapsulation (capsules) ------------------------------------------------

    @classmethod
    def _encapsulation_row(cls, encapsulation_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("encapsulations")
                    .select("*")
                    .eq("id", encapsulation_id)
                    .limit(1)
                )
            ),
            "Selected Encapsulation record was not found.",
            404,
        )

    @classmethod
    def _encapsulation_entry(cls, row: dict[str, Any]) -> dict[str, Any] | None:
        item_id = row.get("output_capsule_inventory_item_id")
        if not item_id:
            return None
        lot_id = row.get("output_capsule_lot_id")
        available = cls._available_qty(str(item_id), str(lot_id) if lot_id else None)
        snapshot = row.get("record_snapshot") or {}
        item_name = snapshot.get("productName") or "Capsules"
        item_code = row.get("encapsulation_code") or snapshot.get("encapsulationCode") or ""
        return {
            "id": str(row["id"]),
            "inventoryItemId": str(item_id),
            "itemName": item_name,
            "itemCode": item_code,
            "availableQty": available,
            "label": f"{item_code} - {item_name} ({int(available)} capsules available)",
        }

    @classmethod
    def _resolve_encapsulation(cls, encapsulation_id: str) -> dict[str, Any]:
        entry = cls._encapsulation_entry(cls._encapsulation_row(encapsulation_id))
        if not entry:
            raise ServiceError("Selected Encapsulation has no available capsule inventory.", 400)
        return entry

    @classmethod
    def _mixing_ids_for_brand(cls, brand_id: str) -> list[str]:
        rows = db.data(
            db.execute(
                db.client().table("mixing_brands").select("mixing_id").eq("brand_id", brand_id)
            )
        )
        return [str(row["mixing_id"]) for row in rows if row.get("mixing_id")]

    @classmethod
    def _list_encapsulation_sources(cls, brand_id: str | None) -> list[dict[str, Any]]:
        query = db.client().table("encapsulations").select("*")
        if brand_id:
            mixing_ids = cls._mixing_ids_for_brand(brand_id)
            if not mixing_ids:
                return []
            query = query.in_("mixing_id", mixing_ids)
        rows = db.data(db.execute(query.order("created_at", desc=True).limit(200)))
        entries = [cls._encapsulation_entry(row) for row in rows]
        return [entry for entry in entries if entry and entry["availableQty"] > 0]

    # -- mixing (powder) ---------------------------------------------------------

    @classmethod
    def _mixing_row(cls, mixing_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client().table("mixings").select("*").eq("id", mixing_id).limit(1)
                )
            ),
            "Selected Mixing record was not found.",
            404,
        )

    @classmethod
    def _mixing_entry(cls, row: dict[str, Any]) -> dict[str, Any] | None:
        item_id = row.get("output_inventory_item_id")
        if not item_id:
            return None
        lot_id = row.get("output_inventory_lot_id")
        available = cls._available_qty(str(item_id), str(lot_id) if lot_id else None)
        snapshot = row.get("record_snapshot") or {}
        item_name = snapshot.get("productName") or "Mixed Powder"
        item_code = row.get("mixing_code") or ""
        return {
            "id": str(row["id"]),
            "inventoryItemId": str(item_id),
            "itemName": item_name,
            "itemCode": item_code,
            "availableQty": available,
            "label": f"{item_code} - {item_name} ({available} kg available)",
        }

    @classmethod
    def _resolve_mixing(cls, mixing_id: str) -> dict[str, Any]:
        entry = cls._mixing_entry(cls._mixing_row(mixing_id))
        if not entry:
            raise ServiceError("Selected Mixing has no available powder inventory.", 400)
        return entry

    @classmethod
    def _list_mixing_sources(cls, brand_id: str | None) -> list[dict[str, Any]]:
        query = db.client().table("mixings").select("*")
        if brand_id:
            mixing_ids = cls._mixing_ids_for_brand(brand_id)
            if not mixing_ids:
                return []
            query = query.in_("id", mixing_ids)
        rows = db.data(db.execute(query.order("created_at", desc=True).limit(200)))
        entries = [cls._mixing_entry(row) for row in rows]
        return [entry for entry in entries if entry and entry["availableQty"] > 0]

    # -- label -------------------------------------------------------------------

    @classmethod
    def _label_row(cls, inventory_item_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("label_specs")
                    .select("*, inventory_items(item_code, item_name)")
                    .eq("inventory_item_id", inventory_item_id)
                    .limit(1)
                )
            ),
            "Selected Label was not found.",
            404,
        )

    @classmethod
    def _label_entry(cls, row: dict[str, Any]) -> dict[str, Any] | None:
        item_id = row.get("inventory_item_id") or row.get("id")
        if not item_id:
            return None
        available = cls._available_qty(str(item_id))
        inventory = row.get("inventory_items") or {}
        item_name = inventory.get("item_name") or row.get("label_name") or "Label"
        item_code = inventory.get("item_code") or row.get("label_name") or ""
        return {
            "id": str(item_id),
            "inventoryItemId": str(item_id),
            "itemName": item_name,
            "itemCode": item_code,
            "availableQty": available,
            "label": f"{item_code} ({int(available)} available)",
        }

    @classmethod
    def _resolve_label(cls, inventory_item_id: str) -> dict[str, Any]:
        entry = cls._label_entry(cls._label_row(inventory_item_id))
        if not entry:
            raise ServiceError("Selected Label has no inventory record.", 400)
        return entry

    @classmethod
    def _list_label_sources(cls, brand_id: str | None) -> list[dict[str, Any]]:
        query = db.client().table("label_specs").select("*, inventory_items(item_code, item_name)")
        if brand_id:
            query = query.eq("brand_id", brand_id)
        rows = db.data(db.execute(query.limit(500)))
        entries = [cls._label_entry(row) for row in rows]
        return [entry for entry in entries if entry and entry["availableQty"] > 0]

    # -- CRUD --------------------------------------------------------------------

    @classmethod
    def _row_by_id(cls, item_id: str) -> dict[str, Any] | None:
        return db.one(
            db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))
        )

    @classmethod
    def list(
        cls,
        *,
        vendor_id: str | None = None,
        brand_id: str | None = None,
        item_type: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        query = db.client().table(cls.TABLE).select("*")
        if vendor_id:
            query = query.eq("vendor_id", vendor_id)
        if brand_id:
            query = query.eq("brand_id", brand_id)
        if item_type:
            query = query.eq("item_type", item_type)
        rows = db.data(
            db.execute(query.order("sent_at", desc=True).limit(max(1, min(int(limit or 500), 2000))))
        )
        records = [row_to_app(row) or {} for row in rows]
        if search:
            needle = str(search).strip().lower()
            records = [
                record
                for record in records
                if needle in str(record.get("itemName") or "").lower()
                or needle in str(record.get("itemCode") or "").lower()
            ]
        return records

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        return row_to_app(
            db.require_row(cls._row_by_id(item_id), "Send record not found")
        ) or {}

    @classmethod
    def _validate_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        vendor_id = str(payload.get("vendorId") or "").strip()
        brand_id = str(payload.get("brandId") or "").strip()
        item_type = str(payload.get("itemType") or "").strip()
        source_id = str(payload.get("sourceId") or "").strip()
        quantity = payload.get("quantity")

        if not vendor_id:
            raise ServiceError("Select the vendor these items are being sent to.", 400)
        if not brand_id:
            raise ServiceError("Select the brand for this shipment.", 400)
        if item_type not in ITEM_TYPES:
            raise ServiceError("Select what type of item is being sent.", 400)
        if not source_id:
            raise ServiceError("Select which record is being sent.", 400)
        try:
            quantity_value = float(quantity)
        except (TypeError, ValueError):
            quantity_value = 0
        if quantity_value <= 0:
            raise ServiceError("Enter a Quantity greater than zero.", 400)

        source = cls.resolve_source(item_type, source_id)
        if quantity_value > source["availableQty"]:
            raise ServiceError(
                f"Not enough quantity available. Available: {source['availableQty']}, "
                f"required: {quantity_value}.",
                400,
            )

        return {
            "vendorId": vendor_id,
            "brandId": brand_id,
            "itemType": item_type,
            "sourceId": source_id,
            "inventoryItemId": source["inventoryItemId"],
            "itemName": source["itemName"],
            "itemCode": source["itemCode"],
            "quantity": quantity_value,
            "sentAt": payload.get("sentAt") or None,
            "notes": (str(payload.get("notes") or "").strip() or None),
        }

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        resolved = cls._validate_payload(payload)
        response = db.execute(
            db.client().rpc("save_sent_item", {"p_id": None, "p_payload": resolved})
        )
        result = response.data
        if isinstance(result, list) and result:
            result = result[0]
        if isinstance(result, dict):
            result = next(iter(result.values()), None)
        if not result:
            raise ServiceError("Send record was not saved", 500)
        return cls.get(str(result))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        db.require_row(cls._row_by_id(item_id), "Send record not found")
        resolved = cls._validate_payload(payload)
        db.execute(
            db.client().rpc("save_sent_item", {"p_id": item_id, "p_payload": resolved})
        )
        return cls.get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> dict[str, Any]:
        db.execute(db.client().rpc("delete_sent_item", {"p_id": item_id}))
        return {"success": True}

__all__ = ["SentItemService", "ITEM_TYPES"]
