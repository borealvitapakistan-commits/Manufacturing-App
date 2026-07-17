from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.inventory.services.bottles_lids import BOTTLE_TYPES, CAPSULE_TYPES, BottleLidService
from apps.inventory.services.labels import LabelService
from apps.manufacturing.services.assembly import AssemblyRules
from apps.manufacturing.services.njp_db import DatabaseNJPService
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value


class DatabaseAssemblyService(AssemblyRules):
    @classmethod
    def _find_njp(cls, njp_id: str) -> dict[str, Any]:
        try:
            return DatabaseNJPService.get(njp_id)
        except ServiceError as error:
            if error.status_code == 404:
                raise ServiceError(
                    "Selected NJP record was not found. Save NJP first, then create Assembly from it.",
                    404,
                )
            raise

    @classmethod
    def _brand_lookup(cls, brand_ref: dict[str, Any]) -> dict[str, Any]:
        brand_id = cls._as_text(brand_ref.get("id") or brand_ref.get("brandId"))
        brand_name = cls._as_text(brand_ref.get("name") or brand_ref.get("brandName")).lower()
        query = db.client().table("brands").select("*").limit(1)
        if brand_id:
            row = db.one(db.execute(query.eq("id", brand_id)))
        elif brand_name:
            row = db.one(db.execute(query.ilike("name", brand_name)))
        else:
            row = None
        if not row:
            return {}
        return {
            "id": str(row["id"]),
            "name": row.get("name") or "",
            "codePrefix": row.get("code_prefix") or "",
            "code_prefix": row.get("code_prefix") or "",
        }

    @classmethod
    def _row_by_id(cls, item_id: str) -> dict[str, Any] | None:
        return db.one(
            db.execute(
                db.client()
                .table("assemblies")
                .select("*")
                .eq("id", item_id)
                .limit(1)
            )
        )

    @classmethod
    def _brand_lot_rows(cls, assembly_id: str) -> list[dict[str, Any]]:
        return db.data(
            db.execute(
                db.client()
                .table("assembly_brand_lots")
                .select("*, brands(id, name, code_prefix)")
                .eq("assembly_id", assembly_id)
                .order("created_at", desc=False)
            )
        )

    @classmethod
    def _brand_lot_rows_bulk(cls, assembly_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """Fetch assembly_brand_lots for many assemblies in a single query.

        Avoids an N+1 round trip per assembly row, which made listing/reporting
        (e.g. the Bottles report and "download all reports") slow enough to
        time out once there were a few hundred Assembly records.
        """
        by_assembly: dict[str, list[dict[str, Any]]] = {}
        if not assembly_ids:
            return by_assembly
        rows = db.data(
            db.execute(
                db.client()
                .table("assembly_brand_lots")
                .select("*, brands(id, name, code_prefix)")
                .in_("assembly_id", assembly_ids)
                .order("created_at", desc=False)
            )
        )
        for row in rows:
            by_assembly.setdefault(str(row.get("assembly_id")), []).append(row)
        return by_assembly

    @classmethod
    def _db_to_app(
        cls,
        row: dict[str, Any],
        *,
        brand_lots: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        snapshot = dict(row.get("record_snapshot") or {})
        assembly_id = str(row["id"])
        if brand_lots is None:
            brand_lots = cls._brand_lot_rows(assembly_id)
        brand_batch_codes: list[dict[str, Any]] = []
        for item in brand_lots:
            brand = item.get("brands") or {}
            brand_batch_codes.append(
                {
                    "brandId": str(item.get("brand_id") or ""),
                    "brandName": brand.get("name") or "",
                    "codePrefix": brand.get("code_prefix") or "",
                    "batchCode": item.get("batch_code") or "",
                    "bottlesQty": item.get("bottles_qty") or 0,
                }
            )

        bottle_type = row.get("bottle_type") or snapshot.get("bottleType") or ""
        bottle_size = str(row.get("bottle_size")) if row.get("bottle_size") is not None else ""
        snapshot.update(
            {
                "id": assembly_id,
                "assemblyCode": row.get("assembly_code") or "",
                "batchCode": row.get("assembly_code") or "",
                "brandBatchCodes": brand_batch_codes,
                "batchCodeDisplay": cls._batch_code_display(
                    brand_batch_codes,
                    row.get("assembly_code") or "",
                ),
                "njpId": str(row["njp_id"]) if row.get("njp_id") else "",
                "location": row.get("location_text") or snapshot.get("location") or "",
                "rackNo": row.get("location_text") or snapshot.get("rackNo") or "",
                "boxNo": row.get("box_number") or snapshot.get("boxNo") or "",
                "bucket": row.get("box_number") or snapshot.get("bucket") or "",
                "bottleType": bottle_type,
                "bottleCapsuleType": bottle_size,
                "bottleSize": bottle_size,
                "bottleCC": bottle_size if bottle_type == "capsule" else None,
                "capsuleWeight": db.as_float(row.get("capsule_weight_mg")),
                "capsuleWeightMg": db.as_float(row.get("capsule_weight_mg")),
                "capsulesReceivedQty": int(db.as_decimal(row.get("capsules_received_qty"))),
                "capsulesReceivedKg": db.as_float(row.get("capsules_received_kg")),
                "capsulesPerBottle": int(row.get("capsules_per_bottle") or 0),
                "totalBottlesMade": int(row.get("total_bottles_made") or 0),
                "totalLabelsUsed": int(row.get("total_labels_used") or 0),
                "labelId": str(row.get("label_id")) if row.get("label_id") else (snapshot.get("labelId") or ""),
                "looseCapsulesQty": int(db.as_decimal(row.get("remaining_capsules_qty"))),
                "remainingCapsulesQty": int(db.as_decimal(row.get("remaining_capsules_qty"))),
                "remainingCapsulesAfterBottlingQty": int(db.as_decimal(row.get("remaining_capsules_qty"))),
                "productionDate": row.get("production_date") or snapshot.get("productionDate"),
                "expiryDate": row.get("expiry_date") or snapshot.get("expiryDate"),
                "status": cls.STATUS_MAP.get(
                    str(row.get("status") or "").lower(),
                    row.get("status") or "",
                ),
                "comments": row.get("comments") or snapshot.get("comments") or "",
                "createdAt": db.timestamp_ms(row.get("created_at")) or snapshot.get("createdAt"),
                "updatedAt": db.timestamp_ms(row.get("updated_at")) or snapshot.get("updatedAt"),
            }
        )
        return cls._public_record(snapshot)

    @classmethod
    def list(
        cls,
        *,
        brand_id: str | None = None,
        product_id: str | None = None,
        njp_id: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("assemblies")
                .select("*")
                .order("created_at", desc=True)
                .limit(max(1, min(int(limit or 500), 2000)))
            )
        )
        brand_lots_by_assembly = cls._brand_lot_rows_bulk([str(row["id"]) for row in rows])
        records = [
            cls._db_to_app(row, brand_lots=brand_lots_by_assembly.get(str(row["id"]), []))
            for row in rows
        ]
        if brand_id:
            records = [
                record
                for record in records
                if str(record.get("brandId")) == str(brand_id)
                or any(str(item) == str(brand_id) for item in record.get("brandIds") or [])
                or any(
                    str(item.get("brandId")) == str(brand_id)
                    for item in record.get("brandBatchCodes") or []
                    if isinstance(item, dict)
                )
            ]
        if product_id:
            records = [record for record in records if str(record.get("productId")) == str(product_id)]
        if njp_id:
            records = [record for record in records if str(record.get("njpId")) == str(njp_id)]
        if search:
            query = str(search).strip().lower()
            records = [
                record
                for record in records
                if query
                in " ".join(
                    [
                        str(record.get("assemblyCode") or ""),
                        str(record.get("batchCodeDisplay") or ""),
                        str(record.get("njpCode") or ""),
                        str(record.get("mixingCode") or ""),
                        str(record.get("productName") or ""),
                        str(record.get("location") or ""),
                        str(record.get("boxNo") or record.get("bucket") or ""),
                        str(record.get("comments") or ""),
                    ]
                ).lower()
            ]
        return records[:limit]

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        return cls._db_to_app(db.require_row(cls._row_by_id(item_id), "Assembly record not found"))

    @staticmethod
    def _status_db(record: dict[str, Any]) -> str:
        value = str(record.get("status") or "").strip().lower()
        if value in {"completed", "assembly completed"}:
            return "completed"
        return "underprocess"

    @classmethod
    def _next_db_brand_code(cls, brand_id: str) -> str:
        response = db.execute(db.client().rpc("next_brand_batch_code", {"p_brand_id": brand_id}))
        result = response.data
        if isinstance(result, str):
            return result
        if isinstance(result, list) and result:
            return str(result[0])
        if isinstance(result, dict):
            return str(next(iter(result.values())))
        raise ServiceError("Could not generate brand batch code.", 500)

    @classmethod
    def _assign_brand_batch_codes(
        cls,
        record: dict[str, Any],
        *,
        previous: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        previous_codes = cls._existing_brand_batch_codes(previous or {})
        brand_batch_codes: list[dict[str, Any]] = []
        for brand_ref in record.get("brands") or []:
            brand_id = cls._as_text(brand_ref.get("id") or brand_ref.get("brandId"))
            if not brand_id:
                continue
            brand_lookup = cls._brand_lookup({"id": brand_id})
            brand_name = brand_ref.get("name") or brand_ref.get("brandName") or brand_lookup.get("name") or ""
            code_prefix = (
                brand_ref.get("codePrefix")
                or brand_ref.get("code_prefix")
                or brand_lookup.get("codePrefix")
                or ""
            )
            key = brand_id or cls._as_text(brand_name).lower()
            batch_code = previous_codes.get(key) or cls._next_db_brand_code(brand_id)
            brand_batch_codes.append(
                {
                    "brandId": brand_id,
                    "brandName": brand_name,
                    "codePrefix": code_prefix,
                    "batchCode": batch_code,
                    "bottlesQty": int(record.get("totalBottlesMade") or 0),
                }
            )

        if not brand_batch_codes:
            raise ServiceError("At least one brand is required to create Assembly batch code.", 400)

        record = {
            **record,
            "brandBatchCodes": brand_batch_codes,
            "assemblyCode": brand_batch_codes[0]["batchCode"],
            "batchCode": brand_batch_codes[0]["batchCode"],
            "batchCodeDisplay": cls._batch_code_display(
                brand_batch_codes,
                brand_batch_codes[0]["batchCode"],
            ),
            "brandId": brand_batch_codes[0]["brandId"],
            "brandName": brand_batch_codes[0]["brandName"],
            "brandIds": [item["brandId"] for item in brand_batch_codes if item.get("brandId")],
            "brandNames": [item["brandName"] for item in brand_batch_codes if item.get("brandName")],
            "isMultiBrand": len(brand_batch_codes) > 1,
        }
        record["capsuleData"] = {
            **(record.get("capsuleData") or {}),
            "brandBatchCodes": brand_batch_codes,
            "batchCodeDisplay": record["batchCodeDisplay"],
        }
        return record

    @classmethod
    def _resolve_bottle_lid(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
        total_bottles_made: int | None,
    ) -> dict[str, Any] | None:
        bottle_lid_id = cls._as_text(cls._pick(payload, existing, "bottleLidId", ""))
        selected_bottle_type = cls._selected_bottle_type(payload, existing)
        selected_bottle_size = cls._selected_bottle_size(payload, existing)
        if not selected_bottle_type and selected_bottle_size:
            selected_bottle_type = "capsule"
        if selected_bottle_type and selected_bottle_type not in BOTTLE_TYPES:
            raise ServiceError("Bottle type must be Capsule or Jar.", 400)

        if bottle_lid_id:
            item = BottleLidService.find_packaging_item(
                bottle_type=selected_bottle_type or "capsule",
                capsule_type=selected_bottle_size or None,
                item_id=bottle_lid_id,
            )
            if not item:
                raise ServiceError("Selected bottle inventory record was not found.", 404)
            cls._validate_bottle_lid_choice(
                item,
                selected_bottle_type=selected_bottle_type,
                selected_bottle_size=selected_bottle_size,
            )
            return item

        if not total_bottles_made or total_bottles_made <= 0:
            return None
        if not selected_bottle_type:
            raise ServiceError("Select Bottle Type before saving Assembly.", 400)
        if selected_bottle_type == "capsule" and selected_bottle_size not in CAPSULE_TYPES:
            raise ServiceError("Select Bottle Type before saving Assembly. Capsule bottles must be 200, 250, or 300.", 400)

        item = BottleLidService.find_packaging_item(
            bottle_type=selected_bottle_type,
            capsule_type=selected_bottle_size if selected_bottle_type == "capsule" else None,
        )
        if not item:
            label = cls._bottle_inventory_label(selected_bottle_type, selected_bottle_size)
            raise ServiceError(
                f"{label} bottles are not available in Bottles / Lids. Add {label} bottles first before creating Assembly.",
                400,
            )
        return item

    @classmethod
    def _resolve_label(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
        total_labels_used: int | None,
        *,
        brand_id: str,
        product_id: str,
    ) -> dict[str, Any] | None:
        label_id = cls._as_text(cls._pick(payload, existing, "labelId", ""))

        if label_id:
            item = LabelService.find_label_item(
                brand_id=brand_id,
                product_id=product_id,
                item_id=label_id,
            )
            if not item:
                raise ServiceError("Selected label inventory record was not found.", 404)
            return item

        if not total_labels_used or total_labels_used <= 0:
            return None

        item = LabelService.find_label_item(brand_id=brand_id, product_id=product_id)
        if not item:
            raise ServiceError(
                "Labels for this brand/product are not available in Labels inventory, or more than one "
                "label matches. Select the label to use, or add label inventory first before creating Assembly.",
                400,
            )
        return item

    @classmethod
    def _njp_row(cls, njp_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("njp_runs")
                    .select("*")
                    .eq("id", njp_id)
                    .limit(1)
                )
            ),
            "Selected NJP record was not found.",
            400,
        )

    @classmethod
    def _validate_njp_inventory(
        cls,
        record: dict[str, Any],
        *,
        previous: dict[str, Any] | None = None,
    ) -> None:
        njp_id, used_qty = cls._assembly_usage(record)
        if not njp_id or used_qty <= 0:
            raise ServiceError("Enter Capsules Received Qty before saving Assembly.", 400)
        source = cls._njp_row(njp_id)
        item_id = source.get("output_capsule_inventory_item_id")
        if not item_id:
            raise ServiceError("Selected NJP has no available capsule inventory.", 400)
        available = db.get_inventory_quantity(inventory_item_id=str(item_id))
        previous_njp_id, previous_used_qty = cls._assembly_usage(previous or {})
        if previous_njp_id == njp_id:
            available += Decimal(previous_used_qty)
        if Decimal(used_qty) > available:
            raise ServiceError(
                f"NJP capsules are not enough. Available: {int(available)}, required: {used_qty}.",
                400,
            )

    @classmethod
    def _validate_bottle_inventory(
        cls,
        record: dict[str, Any],
        *,
        previous: dict[str, Any] | None = None,
    ) -> None:
        bottle_lid_id, used_qty = cls._bottle_lid_usage(record)
        if used_qty <= 0:
            return
        if not bottle_lid_id:
            raise ServiceError("Select the bottle inventory entry that will be used for this Assembly.", 400)
        bottle_lid = BottleLidService.get(bottle_lid_id)
        bottle_type, bottle_size = cls._validate_bottle_lid_choice(
            bottle_lid,
            selected_bottle_type=cls._as_text(record.get("bottleType")).lower(),
            selected_bottle_size=cls._normalize_bottle_size(
                record.get("bottleCapsuleType") or record.get("bottleSize") or record.get("bottleCC")
            ),
        )
        available = db.get_inventory_quantity(inventory_item_id=bottle_lid_id)
        previous_bottle_lid_id, previous_used_qty = cls._bottle_lid_usage(previous or {})
        if previous_bottle_lid_id == bottle_lid_id:
            available += Decimal(previous_used_qty)
        if Decimal(used_qty) > available:
            label = cls._bottle_inventory_label(bottle_type, bottle_size)
            raise ServiceError(
                f"{label} bottles are not enough. Available: {int(available)}, required: {used_qty}. Add more {label} bottles in Bottles / Lids or reduce Total Bottles Made.",
                400,
            )

    @classmethod
    def _validate_label_inventory(
        cls,
        record: dict[str, Any],
        *,
        previous: dict[str, Any] | None = None,
    ) -> None:
        label_id, used_qty = cls._label_usage(record)
        if used_qty <= 0:
            return
        if not label_id:
            raise ServiceError("Select the label inventory entry that will be used for this Assembly.", 400)
        available = db.get_inventory_quantity(inventory_item_id=label_id)
        previous_label_id, previous_used_qty = cls._label_usage(previous or {})
        if previous_label_id == label_id:
            available += Decimal(previous_used_qty)
        if Decimal(used_qty) > available:
            raise ServiceError(
                f"Labels are not enough. Available: {int(available)}, required: {used_qty}. "
                "Add more labels in Labels inventory or reduce Total Bottles Made.",
                400,
            )

    @classmethod
    def _consume_njp(cls, record: dict[str, Any], *, entity_id: str) -> str | None:
        njp_id, used_qty = cls._assembly_usage(record)
        source = cls._njp_row(njp_id)
        item_id = source.get("output_capsule_inventory_item_id")
        if not item_id:
            raise ServiceError("Selected NJP has no available capsule inventory.", 400)
        db.consume_inventory_quantity(
            inventory_item_id=str(item_id),
            quantity=used_qty,
            related_entity_type="assembly",
            related_entity_id=entity_id,
            reason=f"Capsules used in {record.get('assemblyCode') or 'Assembly'}",
            metadata={"njpId": njp_id, "njpCode": record.get("njpCode")},
        )
        return str(source.get("output_capsule_lot_id") or "") or None

    @classmethod
    def _restore_njp(cls, record: dict[str, Any], *, entity_id: str) -> None:
        njp_id, used_qty = cls._assembly_usage(record)
        if not njp_id or used_qty <= 0:
            return
        source = cls._njp_row(njp_id)
        item_id = source.get("output_capsule_inventory_item_id")
        if not item_id:
            return
        db.inventory_movement(
            inventory_item_id=str(item_id),
            inventory_lot_id=(
                str(source["output_capsule_lot_id"])
                if source.get("output_capsule_lot_id")
                else None
            ),
            quantity_delta=used_qty,
            movement_type="adjust",
            related_entity_type="assembly",
            related_entity_id=entity_id,
            reason="Assembly edit/delete restored NJP capsules",
            metadata={"njpId": njp_id, "assemblyCode": record.get("assemblyCode")},
        )

    @classmethod
    def _consume_bottle_lids(cls, record: dict[str, Any], *, entity_id: str) -> str | None:
        bottle_lid_id, used_qty = cls._bottle_lid_usage(record)
        if not bottle_lid_id or used_qty <= 0:
            return None
        db.consume_inventory_quantity(
            inventory_item_id=bottle_lid_id,
            quantity=used_qty,
            related_entity_type="assembly",
            related_entity_id=entity_id,
            reason=f"Bottles used in {record.get('assemblyCode') or 'Assembly'}",
            metadata={
                "assemblyCode": record.get("assemblyCode"),
                "bottleType": record.get("bottleType"),
                "bottleSize": record.get("bottleSize"),
            },
        )
        return db.latest_lot_id(bottle_lid_id)

    @classmethod
    def _restore_bottle_lids(cls, record: dict[str, Any], *, entity_id: str) -> None:
        bottle_lid_id, used_qty = cls._bottle_lid_usage(record)
        if not bottle_lid_id or used_qty <= 0:
            return
        db.inventory_movement(
            inventory_item_id=bottle_lid_id,
            quantity_delta=used_qty,
            movement_type="adjust",
            related_entity_type="assembly",
            related_entity_id=entity_id,
            reason="Assembly edit/delete restored bottle inventory",
            metadata={
                "assemblyCode": record.get("assemblyCode"),
                "bottleType": record.get("bottleType"),
                "bottleSize": record.get("bottleSize"),
            },
        )

    @classmethod
    def _consume_labels(cls, record: dict[str, Any], *, entity_id: str) -> str | None:
        label_id, used_qty = cls._label_usage(record)
        if not label_id or used_qty <= 0:
            return None
        db.consume_inventory_quantity(
            inventory_item_id=label_id,
            quantity=used_qty,
            related_entity_type="assembly",
            related_entity_id=entity_id,
            reason=f"Labels used in {record.get('assemblyCode') or 'Assembly'}",
            metadata={"assemblyCode": record.get("assemblyCode")},
        )
        return db.latest_lot_id(label_id)

    @classmethod
    def _restore_labels(cls, record: dict[str, Any], *, entity_id: str) -> None:
        label_id, used_qty = cls._label_usage(record)
        if not label_id or used_qty <= 0:
            return
        db.inventory_movement(
            inventory_item_id=label_id,
            quantity_delta=used_qty,
            movement_type="adjust",
            related_entity_type="assembly",
            related_entity_id=entity_id,
            reason="Assembly edit/delete restored label inventory",
            metadata={"assemblyCode": record.get("assemblyCode")},
        )

    @classmethod
    def _insert_children(cls, assembly_id: str, record: dict[str, Any]) -> None:
        db.execute(db.client().table("assembly_sessions").delete().eq("assembly_id", assembly_id))
        db.execute(db.client().table("assembly_brands").delete().eq("assembly_id", assembly_id))
        db.execute(db.client().table("assembly_brand_lots").delete().eq("assembly_id", assembly_id))

        brand_rows = []
        for index, item in enumerate(record.get("brandBatchCodes") or [], start=1):
            brand_id = item.get("brandId")
            if not brand_id:
                continue
            brand_rows.append(
                {
                    "assembly_id": assembly_id,
                    "brand_id": brand_id,
                    "is_primary": index == 1,
                }
            )
        if brand_rows:
            db.execute(db.client().table("assembly_brands").insert(brand_rows))

        location_id = db.ensure_location(record.get("location"))
        lot_rows = []
        for item in record.get("brandBatchCodes") or []:
            brand_id = item.get("brandId")
            batch_code = item.get("batchCode")
            if not brand_id or not batch_code:
                continue
            product_name = record.get("productName") or "Finished goods"
            inventory_item = db.create_inventory_item(
                item_kind="finished_good",
                item_code=str(batch_code),
                item_name=f"{product_name} bottles",
                unit_of_measure="each",
                metadata={
                    "assemblyId": assembly_id,
                    "batchCode": batch_code,
                    "brandId": brand_id,
                },
            )
            inventory_item_id = str(inventory_item["id"])
            lot = db.create_lot(
                inventory_item_id=inventory_item_id,
                lot_code=str(batch_code),
                location_id=location_id,
                manufacture_date=db.date_from_ms(record.get("productionDate")),
                expiry_date=db.date_from_ms(record.get("expiryDate")),
                source_document_type="assembly",
                source_document_id=assembly_id,
                metadata={
                    "assemblyId": assembly_id,
                    "batchCode": batch_code,
                    "brandId": brand_id,
                },
            )
            lot_id = str(lot["id"]) if lot else None
            bottles_qty = int(item.get("bottlesQty") or record.get("totalBottlesMade") or 0)
            if bottles_qty > 0:
                db.inventory_movement(
                    inventory_item_id=inventory_item_id,
                    inventory_lot_id=lot_id,
                    location_id=location_id,
                    quantity_delta=bottles_qty,
                    movement_type="produce",
                    related_entity_type="assembly",
                    related_entity_id=assembly_id,
                    reason="Assembly produced finished goods",
                    metadata={"batchCode": batch_code},
                )
            lot_rows.append(
                {
                    "assembly_id": assembly_id,
                    "brand_id": brand_id,
                    "finished_good_inventory_item_id": inventory_item_id,
                    "finished_good_lot_id": lot_id,
                    "batch_code": batch_code,
                    "bottles_qty": bottles_qty,
                    "comments": record.get("comments"),
                }
            )
        if lot_rows:
            db.execute(db.client().table("assembly_brand_lots").insert(lot_rows))

        session_rows = []
        for index, row in enumerate(record.get("assemblySessions") or [], start=1):
            session_date = db.date_from_ms(row.get("date") or row.get("sessionDate") or row.get("startDate"))
            if not session_date:
                continue
            session_rows.append(
                {
                    "assembly_id": assembly_id,
                    "session_date": session_date,
                    "start_time": row.get("startTime") or None,
                    "end_time": row.get("endTime") or None,
                    "remarks": row.get("remarks") or row.get("dayRemarks"),
                    "sort_order": index,
                }
            )
        if session_rows:
            db.execute(db.client().table("assembly_sessions").insert(session_rows))

    @classmethod
    def _reverse_finished_goods(cls, row: dict[str, Any]) -> None:
        assembly_id = str(row["id"])
        for lot in cls._brand_lot_rows(assembly_id):
            item_id = lot.get("finished_good_inventory_item_id")
            if not item_id:
                continue
            lot_id = str(lot["finished_good_lot_id"]) if lot.get("finished_good_lot_id") else None
            qty = db.as_decimal(lot.get("bottles_qty"))
            available = db.get_inventory_quantity(inventory_item_id=str(item_id), inventory_lot_id=lot_id)
            if qty > available:
                raise ServiceError(
                    "Cannot edit or delete this Assembly because finished goods have already been consumed from it.",
                    409,
                )
            db.inventory_movement(
                inventory_item_id=str(item_id),
                inventory_lot_id=lot_id,
                quantity_delta=-qty,
                movement_type="adjust",
                related_entity_type="assembly",
                related_entity_id=assembly_id,
                reason="Assembly edit/delete reversed finished goods output",
                metadata={"batchCode": lot.get("batch_code")},
            )

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, records=records)
        cleaned = cls._assign_brand_batch_codes(cleaned)
        cls._validate_njp_inventory(cleaned)
        cls._validate_bottle_inventory(cleaned)
        cls._validate_label_inventory(cleaned)

        location_id = db.ensure_location(cleaned.get("location"))
        bottle_type = cleaned.get("bottleType") or "capsule"
        bottle_size = int(cleaned.get("bottleSize")) if bottle_type == "capsule" else None
        created = db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("assemblies")
                    .insert(
                        {
                            "assembly_code": cleaned.get("assemblyCode"),
                            "njp_id": cleaned.get("njpId"),
                            "location_id": location_id,
                            "location_text": cleaned.get("location"),
                            "box_number": cleaned.get("boxNo"),
                            "bottle_type": bottle_type,
                            "bottle_size": bottle_size,
                            "capsule_weight_mg": db.decimal_str(cleaned.get("capsuleWeightMg")),
                            "capsules_received_qty": db.decimal_str(cleaned.get("capsulesReceivedQty")),
                            "capsules_received_kg": db.decimal_str(cleaned.get("capsulesReceivedKg")),
                            "capsules_per_bottle": int(cleaned.get("capsulesPerBottle") or 0),
                            "total_bottles_made": int(cleaned.get("totalBottlesMade") or 0),
                            "total_labels_used": int(cleaned.get("totalLabelsUsed") or 0),
                            "remaining_capsules_qty": db.decimal_str(
                                cleaned.get("remainingCapsulesAfterBottlingQty")
                                or cleaned.get("looseCapsulesQty")
                                or 0
                            ),
                            "bottle_cc": str(cleaned.get("bottleCC") or "") or None,
                            "filled_bottle_weight": str(cleaned.get("filledBottleWeight") or "") or None,
                            "production_date": db.date_from_ms(cleaned.get("productionDate")),
                            "expiry_date": db.date_from_ms(cleaned.get("expiryDate")),
                            "status": cls._status_db(cleaned),
                            "operator_name": cleaned.get("operatorName"),
                            "comments": cleaned.get("comments"),
                            "record_snapshot": to_json_value(cleaned),
                        }
                    )
                )
            ),
            "Assembly was not saved",
            500,
        )
        assembly_id = str(created["id"])
        record = {**cleaned, "id": assembly_id}
        input_lot_id = cls._consume_njp(record, entity_id=assembly_id)
        packaging_lot_id = cls._consume_bottle_lids(record, entity_id=assembly_id)
        label_lot_id = cls._consume_labels(record, entity_id=assembly_id)
        db.execute(
            db.client()
            .table("assemblies")
            .update(
                {
                    "input_capsule_lot_id": input_lot_id,
                    "packaging_lot_id": packaging_lot_id,
                    "label_id": record.get("labelId") or None,
                    "label_lot_id": label_lot_id,
                    "record_snapshot": to_json_value(record),
                }
            )
            .eq("id", assembly_id)
        )
        cls._insert_children(assembly_id, record)
        return cls.get(assembly_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = db.require_row(cls._row_by_id(item_id), "Assembly record not found")
        previous = cls._db_to_app(row)
        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, existing=previous, records=records)
        cleaned = cls._assign_brand_batch_codes(cleaned, previous=previous)
        cls._validate_njp_inventory(cleaned, previous=previous)
        cls._validate_bottle_inventory(cleaned, previous=previous)
        cls._validate_label_inventory(cleaned, previous=previous)
        cls._reverse_finished_goods(row)
        cls._restore_njp(previous, entity_id=item_id)
        cls._restore_bottle_lids(previous, entity_id=item_id)
        cls._restore_labels(previous, entity_id=item_id)

        record = {**cleaned, "id": item_id}
        input_lot_id = cls._consume_njp(record, entity_id=item_id)
        packaging_lot_id = cls._consume_bottle_lids(record, entity_id=item_id)
        label_lot_id = cls._consume_labels(record, entity_id=item_id)
        location_id = db.ensure_location(record.get("location"))
        bottle_type = record.get("bottleType") or "capsule"
        bottle_size = int(record.get("bottleSize")) if bottle_type == "capsule" else None
        db.execute(
            db.client()
            .table("assemblies")
            .update(
                {
                    "assembly_code": record.get("assemblyCode"),
                    "njp_id": record.get("njpId"),
                    "input_capsule_lot_id": input_lot_id,
                    "packaging_lot_id": packaging_lot_id,
                    "label_id": record.get("labelId") or None,
                    "label_lot_id": label_lot_id,
                    "location_id": location_id,
                    "location_text": record.get("location"),
                    "box_number": record.get("boxNo"),
                    "bottle_type": bottle_type,
                    "bottle_size": bottle_size,
                    "capsule_weight_mg": db.decimal_str(record.get("capsuleWeightMg")),
                    "capsules_received_qty": db.decimal_str(record.get("capsulesReceivedQty")),
                    "capsules_received_kg": db.decimal_str(record.get("capsulesReceivedKg")),
                    "capsules_per_bottle": int(record.get("capsulesPerBottle") or 0),
                    "total_bottles_made": int(record.get("totalBottlesMade") or 0),
                    "total_labels_used": int(record.get("totalLabelsUsed") or 0),
                    "remaining_capsules_qty": db.decimal_str(
                        record.get("remainingCapsulesAfterBottlingQty")
                        or record.get("looseCapsulesQty")
                        or 0
                    ),
                    "bottle_cc": str(record.get("bottleCC") or "") or None,
                    "filled_bottle_weight": str(record.get("filledBottleWeight") or "") or None,
                    "production_date": db.date_from_ms(record.get("productionDate")),
                    "expiry_date": db.date_from_ms(record.get("expiryDate")),
                    "status": cls._status_db(record),
                    "operator_name": record.get("operatorName"),
                    "comments": record.get("comments"),
                    "version": int(row.get("version") or 1) + 1,
                    "record_snapshot": to_json_value(record),
                }
            )
            .eq("id", item_id)
        )
        cls._insert_children(item_id, record)
        return cls.get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(cls._row_by_id(item_id), "Assembly record not found")
        previous = cls._db_to_app(row)
        cls._reverse_finished_goods(row)
        cls._restore_njp(previous, entity_id=item_id)
        cls._restore_bottle_lids(previous, entity_id=item_id)
        cls._restore_labels(previous, entity_id=item_id)
        db.execute(db.client().table("assemblies").delete().eq("id", item_id))
        return {"success": True}


__all__ = ["DatabaseAssemblyService"]
