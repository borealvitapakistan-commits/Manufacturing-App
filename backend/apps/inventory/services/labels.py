from __future__ import annotations

from typing import Any

from apps.commercial.services.brands import BrandService
from apps.commercial.services.products import ProductService
from services import db
from services.base_service import ServiceError, TableService

CATALOG_TYPES = {"capsule", "tablets", "softgel", "liquid", "lozengers", "powder"}
LABEL_DOSAGE_TYPES = {"60", "90", "120", "180", "240"}


class LabelService(TableService):
    table_name = "label_inventory"

    @classmethod
    def list(
        cls,
        *,
        filters: dict[str, Any] | None = None,
        limit: int = 100,
        **kwargs,
    ):
        return cls._db_list(filters=filters, limit=limit)

    @staticmethod
    def normalize_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)
        if "type" in normalized:
            normalized["type"] = str(normalized["type"] or "").strip().lower() or "capsule"
            if normalized["type"] not in CATALOG_TYPES:
                raise ServiceError("Invalid label type", 400)
        elif not partial:
            normalized["type"] = "capsule"
        if "dosageType" in normalized:
            normalized["dosageType"] = str(normalized["dosageType"] or "").strip() or "60"
            if normalized["dosageType"] not in LABEL_DOSAGE_TYPES:
                raise ServiceError("Invalid label dosage type", 400)
        elif not partial:
            normalized["dosageType"] = "60"
        if "labelName" in normalized:
            normalized["labelName"] = (
                str(normalized["labelName"] or "").strip() or "Standard Label"
            )
        if "notes" in normalized:
            normalized["notes"] = str(normalized["notes"] or "").strip() or None
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload)
        brand = BrandService.get(str(normalized["brandId"]))
        product = ProductService.get(str(normalized["productId"]))
        normalized["brandName"] = brand["name"]
        normalized["productName"] = product["name"]
        normalized.setdefault("labelName", "Standard Label")
        return cls._db_create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls.get(item_id)
        normalized = cls.normalize_payload(payload, partial=True)
        if "brandId" in normalized:
            normalized["brandName"] = BrandService.get(str(normalized["brandId"]))["name"]
        if "productId" in normalized:
            normalized["productName"] = ProductService.get(str(normalized["productId"]))["name"]
        return cls._db_update(item_id, normalized)

    @classmethod
    def validate(cls, brand_id: str, product_id: str, required: int) -> dict[str, Any]:
        labels = cls._db_list(filters={"brand_id": brand_id, "product_id": product_id, "is_active": True}, limit=1000)
        available = sum(max(0, int(row.get("quantity") or 0)) for row in labels)
        shortage = max(required - available, 0)
        return {
            "hasShortage": shortage > 0,
            "required": required,
            "available": available,
            "shortage": shortage,
        }

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        return cls._db_get(item_id)

    @classmethod
    def find_label_item(
        cls,
        *,
        brand_id: str,
        product_id: str,
        item_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Resolve a single label inventory item for Assembly label deduction.

        If ``item_id`` is given, it is used directly (an explicit dropdown
        choice). Otherwise this looks up active labels for the brand/product
        pair and only auto-resolves when exactly one match exists, mirroring
        ``BottleLidService.find_packaging_item``.
        """
        if item_id:
            try:
                return cls.get(item_id)
            except ServiceError:
                return None
        if not brand_id or not product_id:
            return None
        rows = cls._db_list(
            filters={"brand_id": brand_id, "product_id": product_id, "is_active": True},
            limit=1000,
        )
        return rows[0] if len(rows) == 1 else None

    @classmethod
    def delete(cls, item_id: str) -> None:
        db.execute(db.client().table("inventory_items").update({"is_active": False}).eq("id", item_id))
        return None

    @classmethod
    def _db_list(cls, *, filters: dict[str, Any] | None = None, limit: int = 100, **kwargs) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("label_specs")
                .select("*, inventory_items(*)")
                .limit(max(1, min(limit, 1000)))
            )
        )
        filters = filters or {}

        def matches(row: dict[str, Any]) -> bool:
            item = row.get("inventory_items") or {}
            for key, value in filters.items():
                if value in (None, ""):
                    continue
                if key in {"brand_id", "brandId"} and str(row.get("brand_id") or "") != str(value):
                    return False
                if key in {"product_id", "productId"} and str(row.get("product_id") or "") != str(value):
                    return False
                if key in {"is_active", "isActive"} and bool(item.get("is_active", True)) != bool(value):
                    return False
            return True

        return [cls._db_to_app(row) for row in rows if matches(row)]

    @classmethod
    def _db_get(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("label_specs")
                    .select("*, inventory_items(*)")
                    .eq("inventory_item_id", item_id)
                    .limit(1)
                )
            ),
            "Label inventory record not found",
        )
        return cls._db_to_app(row)

    @staticmethod
    def _name_lookup(table: str, item_id: Any, column: str) -> str | None:
        if not item_id:
            return None
        row = db.one(
            db.execute(
                db.client().table(table).select(column).eq("id", str(item_id)).limit(1)
            )
        )
        return row.get(column) if row else None

    @classmethod
    def _db_to_app(cls, row: dict[str, Any]) -> dict[str, Any]:
        item = row.get("inventory_items") or {}
        item_id = str(row.get("inventory_item_id") or row.get("id") or item.get("id"))
        quantity = int(db.get_inventory_quantity(inventory_item_id=item_id))
        product_name = cls._name_lookup("products", row.get("product_id"), "product_name")
        brand_name = cls._name_lookup("brands", row.get("brand_id"), "name")
        return {
            "id": item_id,
            "brandId": str(row.get("brand_id")) if row.get("brand_id") else "",
            "brandName": brand_name,
            "productId": str(row.get("product_id")) if row.get("product_id") else "",
            "productName": product_name,
            "type": row.get("label_type"),
            "dosageType": str(row.get("dosage_count") or ""),
            "labelName": row.get("label_name"),
            "quantity": quantity,
            "reorderLevel": int(db.as_decimal(item.get("reorder_level"))),
            "notes": row.get("notes"),
            "isActive": item.get("is_active", True),
            "createdAt": db.timestamp_ms(item.get("created_at") or row.get("created_at")),
            "updatedAt": db.timestamp_ms(item.get("updated_at") or row.get("updated_at")),
            "created_at": item.get("created_at") or row.get("created_at"),
            "updated_at": item.get("updated_at") or row.get("updated_at"),
        }

    @staticmethod
    def _item_name(normalized: dict[str, Any]) -> str:
        parts = [
            normalized.get("brandName"),
            normalized.get("productName"),
            normalized.get("labelName") or "Label",
            str(normalized.get("dosageType") or ""),
        ]
        return " - ".join(str(part) for part in parts if part)

    @classmethod
    def _db_create(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        item = db.create_inventory_item(
            item_kind="label",
            item_name=cls._item_name(normalized),
            item_code=None,
            unit_of_measure="each",
            reorder_level=normalized.get("reorderLevel") or 0,
        )
        item_id = str(item["id"])
        db.execute(
            db.client()
            .table("label_specs")
            .insert(
                {
                    "inventory_item_id": item_id,
                    "brand_id": str(normalized.get("brandId")) if normalized.get("brandId") else None,
                    "product_id": str(normalized.get("productId")) if normalized.get("productId") else None,
                    "label_name": normalized.get("labelName") or "Standard Label",
                    "label_type": normalized.get("type") or "capsule",
                    "dosage_count": int(normalized.get("dosageType")) if normalized.get("dosageType") else None,
                    "notes": normalized.get("notes"),
                    "metadata": db.json_safe(normalized),
                }
            )
        )
        quantity = int(normalized.get("quantity") or 0)
        if quantity > 0:
            lot = db.one(
                db.execute(
                    db.client()
                    .table("inventory_lots")
                    .insert(
                        {
                            "inventory_item_id": item_id,
                            "lot_code": item_id,
                            "status": "available",
                        }
                    )
                )
            )
            db.inventory_movement(
                inventory_item_id=item_id,
                inventory_lot_id=str(lot["id"]) if lot else None,
                quantity_delta=quantity,
                movement_type="receive",
                related_entity_type="label",
                related_entity_id=item_id,
                reason="Initial label stock",
            )
        return cls.get(item_id)

    @classmethod
    def _db_update(cls, item_id: str, normalized: dict[str, Any]) -> dict[str, Any]:
        current = cls.get(item_id)
        spec_payload = {}
        if "brandId" in normalized:
            spec_payload["brand_id"] = str(normalized.get("brandId")) if normalized.get("brandId") else None
        if "productId" in normalized:
            spec_payload["product_id"] = str(normalized.get("productId")) if normalized.get("productId") else None
        if "labelName" in normalized:
            spec_payload["label_name"] = normalized.get("labelName") or "Standard Label"
        if "type" in normalized:
            spec_payload["label_type"] = normalized.get("type") or "capsule"
        if "dosageType" in normalized:
            spec_payload["dosage_count"] = int(normalized.get("dosageType")) if normalized.get("dosageType") else None
        if "notes" in normalized:
            spec_payload["notes"] = normalized.get("notes")
        if spec_payload:
            spec_payload["metadata"] = db.json_safe({**current, **normalized})
            db.execute(
                db.client()
                .table("label_specs")
                .update(spec_payload)
                .eq("inventory_item_id", item_id)
            )

        item_payload = {}
        if any(key in normalized for key in ("brandName", "productName", "labelName", "dosageType")):
            item_payload["item_name"] = cls._item_name({**current, **normalized})
        if "reorderLevel" in normalized:
            item_payload["reorder_level"] = db.decimal_str(normalized.get("reorderLevel"))
        if "isActive" in normalized:
            item_payload["is_active"] = normalized.get("isActive")
        if item_payload:
            db.execute(db.client().table("inventory_items").update(item_payload).eq("id", item_id))

        if "quantity" in normalized:
            delta = int(normalized.get("quantity") or 0) - int(current.get("quantity") or 0)
            if delta:
                db.inventory_movement(
                    inventory_item_id=item_id,
                    quantity_delta=delta,
                    movement_type="adjust",
                    related_entity_type="label",
                    related_entity_id=item_id,
                    reason="Label stock update",
                )
        return cls.get(item_id)


__all__ = ["LabelService"]
