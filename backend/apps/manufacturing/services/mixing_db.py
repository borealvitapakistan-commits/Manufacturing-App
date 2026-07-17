from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.manufacturing.services.mixing import MixingRules
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value


class DatabaseMixingService(MixingRules):
    @classmethod
    def _normalize_session_date(cls, value: Any) -> str | None:
        """Convert supported date inputs to PostgreSQL's YYYY-MM-DD format.

        The frontend may send an ISO date, an ISO datetime, a Python
        ``date``/``datetime`` object, or a JavaScript Unix timestamp in
        milliseconds. PostgreSQL ``date`` columns cannot accept the raw
        millisecond timestamp, so it must be converted before insertion.
        """
        if value is None:
            return None

        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None

        if isinstance(value, datetime):
            parsed_datetime = value
            if timezone.is_aware(parsed_datetime):
                parsed_datetime = timezone.localtime(
                    parsed_datetime,
                    timezone.get_current_timezone(),
                )
            return parsed_datetime.date().isoformat()

        if isinstance(value, date):
            return value.isoformat()

        numeric_value: float | None = None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            numeric_value = float(value)
        elif isinstance(value, str):
            try:
                numeric_value = float(value)
            except ValueError:
                numeric_value = None

        if numeric_value is not None:
            try:
                # JavaScript Date.getTime() returns milliseconds.
                if abs(numeric_value) > 10_000_000_000:
                    numeric_value /= 1000

                parsed_datetime = datetime.fromtimestamp(
                    numeric_value,
                    tz=dt_timezone.utc,
                )
                parsed_datetime = timezone.localtime(
                    parsed_datetime,
                    timezone.get_current_timezone(),
                )
                return parsed_datetime.date().isoformat()
            except (OSError, OverflowError, ValueError) as exc:
                raise ServiceError(
                    f"Invalid mixing session date: {value!r}.",
                    400,
                ) from exc

        if isinstance(value, str):
            try:
                return date.fromisoformat(value).isoformat()
            except ValueError:
                pass

            try:
                parsed_datetime = datetime.fromisoformat(
                    value.replace("Z", "+00:00")
                )
                if timezone.is_aware(parsed_datetime):
                    parsed_datetime = timezone.localtime(
                        parsed_datetime,
                        timezone.get_current_timezone(),
                    )
                return parsed_datetime.date().isoformat()
            except ValueError:
                pass

        raise ServiceError(
            (
                f"Invalid mixing session date: {value!r}. "
                "Use YYYY-MM-DD, an ISO datetime, or a Unix timestamp."
            ),
            400,
        )

    @classmethod
    def _product_by_id(cls, product_id: Any) -> dict[str, Any]:
        product_id_text = cls._as_text(product_id)
        if not product_id_text:
            return {}
        row = db.one(
            db.execute(
                db.client()
                .table("products")
                .select("*")
                .eq("id", product_id_text)
                .limit(1)
            )
        )
        if not row:
            return {}
        return {
            "id": str(row["id"]),
            "productName": row.get("product_name"),
            "name": row.get("product_name"),
            "productCode": row.get("product_code"),
            "npn": row.get("npn"),
            "type": row.get("product_type"),
        }

    @classmethod
    def _row_by_id(cls, item_id: str) -> dict[str, Any] | None:
        return db.one(
            db.execute(
                db.client()
                .table("mixings")
                .select("*")
                .eq("id", item_id)
                .limit(1)
            )
        )

    @classmethod
    def _db_to_app(cls, row: dict[str, Any]) -> dict[str, Any]:
        snapshot = dict(row.get("record_snapshot") or {})
        item_id = str(row["id"])
        available = Decimal("0")
        if row.get("output_inventory_item_id"):
            available = db.get_inventory_quantity(
                inventory_item_id=str(row["output_inventory_item_id"]),
                inventory_lot_id=(
                    str(row["output_inventory_lot_id"])
                    if row.get("output_inventory_lot_id")
                    else None
                ),
            )

        snapshot.update(
            {
                "id": item_id,
                "mixingCode": row.get("mixing_code"),
                "productId": str(row["product_id"]) if row.get("product_id") else "",
                "location": row.get("location_text") or snapshot.get("location") or "",
                "rackNo": row.get("location_text") or snapshot.get("rackNo") or "",
                "totalKgInMixing": db.as_float(row.get("total_kg_in_mixing")),
                "existingMixedPowderUsedKg": db.as_float(row.get("existing_mixed_powder_used_kg")),
                "freshMixingRequiredKg": db.as_float(row.get("fresh_mixing_required_kg")),
                "calculatedFreshRawMaterialsTotalKg": db.as_float(
                    row.get("calculated_fresh_raw_materials_total_kg")
                ),
                "totalMixedQtyKg": db.as_float(row.get("total_mixed_qty_kg")),
                "availableMixedPowderKg": float(available),
                "remainingMixedPowderKg": float(available),
                "outputInventoryItemId": (
                    str(row["output_inventory_item_id"])
                    if row.get("output_inventory_item_id")
                    else ""
                ),
                "outputInventoryLotId": (
                    str(row["output_inventory_lot_id"])
                    if row.get("output_inventory_lot_id")
                    else ""
                ),
                "status": row.get("status"),
                "remarks": row.get("remarks") or snapshot.get("remarks") or "",
                "changeReason": row.get("change_reason") or snapshot.get("changeReason") or "",
                "createdAt": db.timestamp_ms(row.get("created_at")) or snapshot.get("createdAt"),
                "updatedAt": db.timestamp_ms(row.get("updated_at")) or snapshot.get("updatedAt"),
            }
        )
        return cls._with_product_identity(snapshot)

    @classmethod
    def list(
        cls,
        *,
        brand_id: str | None = None,
        product_id: str | None = None,
        mixing_code: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("mixings")
                .select("*")
                .order("created_at", desc=True)
                .limit(max(1, min(int(limit or 500), 2000)))
            )
        )
        records = [cls._db_to_app(row) for row in rows]
        if brand_id:
            records = [record for record in records if cls._record_has_brand(record, str(brand_id))]
        if product_id:
            records = [record for record in records if str(record.get("productId")) == str(product_id)]
        if mixing_code:
            records = [
                record
                for record in records
                if str(record.get("mixingCode") or "").lower() == str(mixing_code).lower()
            ]
        if search:
            query = str(search).strip().lower()
            records = [
                record
                for record in records
                if query
                in " ".join(
                    [
                        str(record.get("mixingCode") or ""),
                        str(record.get("productName") or ""),
                        str(record.get("productCode") or ""),
                        str(record.get("brandName") or ""),
                        " ".join(record.get("brandNames") or []),
                        str(record.get("location") or ""),
                    ]
                ).lower()
            ]
        return records[:limit]

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        return cls._db_to_app(db.require_row(cls._row_by_id(item_id), "Mixing record not found"))

    @classmethod
    def _insert_children(cls, mixing_id: str, record: dict[str, Any]) -> None:
        db.execute(db.client().table("mixing_brands").delete().eq("mixing_id", mixing_id))
        db.execute(db.client().table("mixing_ingredients").delete().eq("mixing_id", mixing_id))
        db.execute(db.client().table("mixing_sessions").delete().eq("mixing_id", mixing_id))

        brand_rows = []
        for index, brand in enumerate(record.get("brands") or [], start=1):
            brand_id = brand.get("id") or brand.get("brandId")
            if not brand_id:
                continue
            brand_rows.append(
                {
                    "mixing_id": mixing_id,
                    "brand_id": str(brand_id),
                    "is_primary": index == 1,
                }
            )
        if brand_rows:
            db.execute(db.client().table("mixing_brands").insert(brand_rows))

        ingredient_rows = []
        sort_order = 1
        for section, ingredient_type in (
            ("medicinalIngredients", "medicinal"),
            ("nonMedicinalIngredients", "non_medicinal"),
        ):
            for row in record.get(section) or []:
                ingredient_rows.append(
                    {
                        "mixing_id": mixing_id,
                        "ingredient_type": ingredient_type,
                        "raw_material_id": row.get("rawMaterialId") or None,
                        "raw_material_name": (
                            row.get("rawMaterialName")
                            or row.get("rawMaterial")
                            or row.get("nmiName")
                        ),
                        "mg_dose_used": db.decimal_str(row.get("mgDoseUsed") or row.get("dosageMg") or 0),
                        "percent_share": db.decimal_str(row.get("percentShare") or 0),
                        "kg_used": db.decimal_str(row.get("kgUsed") or 0),
                        "remarks": row.get("remarks"),
                        "sort_order": sort_order,
                        "metadata": to_json_value(row),
                    }
                )
                sort_order += 1
        if ingredient_rows:
            db.execute(db.client().table("mixing_ingredients").insert(ingredient_rows))

        session_rows = []
        for index, row in enumerate(record.get("mixingSessions") or [], start=1):
            session_date = cls._normalize_session_date(
                row.get("date") or row.get("sessionDate")
            )
            if not session_date:
                continue
            session_rows.append(
                {
                    "mixing_id": mixing_id,
                    "session_date": session_date,
                    "start_time": row.get("startTime") or None,
                    "end_time": row.get("endTime") or None,
                    "remarks": row.get("remarks") or row.get("dayRemarks"),
                    "sort_order": index,
                }
            )
        if session_rows:
            db.execute(db.client().table("mixing_sessions").insert(session_rows))

    @classmethod
    def _material_rows(cls, record: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for section in ("medicinalIngredients", "nonMedicinalIngredients"):
            rows.extend(record.get(section) or [])
        return rows

    @classmethod
    def _consume_raw_materials(cls, record: dict[str, Any], *, entity_id: str) -> None:
        for row in cls._material_rows(record):
            raw_material_id = row.get("rawMaterialId")
            kg_used = db.as_decimal(row.get("kgUsed"))
            if not raw_material_id or kg_used <= 0:
                continue
            db.consume_inventory_quantity(
                inventory_item_id=str(raw_material_id),
                quantity=kg_used,
                related_entity_type="mixing",
                related_entity_id=entity_id,
                reason=f"Raw material used in {record.get('mixingCode') or 'mixing'}",
                metadata={"mixingCode": record.get("mixingCode"), "row": to_json_value(row)},
            )

    @classmethod
    def _restore_raw_materials(cls, record: dict[str, Any], *, entity_id: str) -> None:
        for row in cls._material_rows(record):
            raw_material_id = row.get("rawMaterialId")
            kg_used = db.as_decimal(row.get("kgUsed"))
            if not raw_material_id or kg_used <= 0:
                continue
            db.inventory_movement(
                inventory_item_id=str(raw_material_id),
                quantity_delta=kg_used,
                movement_type="adjust",
                related_entity_type="mixing",
                related_entity_id=entity_id,
                reason="Mixing edit/delete restored raw material",
                metadata={"mixingCode": record.get("mixingCode"), "row": to_json_value(row)},
            )

    @classmethod
    def _source_powder_row(cls, source_id: str | None) -> dict[str, Any] | None:
        if not source_id:
            return None
        return cls._row_by_id(str(source_id))

    @classmethod
    def _consume_existing_powder(cls, record: dict[str, Any], *, entity_id: str) -> str | None:
        source_type, source_id, used_kg = cls._existing_powder_usage(record)
        if used_kg <= 0:
            return None
        if source_type not in {"", "mixing", "mixed_powder"}:
            raise ServiceError("Existing mixed powder reuse must select a saved mixing record.", 400)
        source = db.require_row(
            cls._source_powder_row(source_id),
            "Selected existing mixed powder was not found.",
            400,
        )
        item_id = source.get("output_inventory_item_id")
        if not item_id:
            raise ServiceError("Selected existing mixed powder has no inventory lot.", 400)
        db.consume_inventory_quantity(
            inventory_item_id=str(item_id),
            quantity=used_kg,
            related_entity_type="mixing",
            related_entity_id=entity_id,
            reason=f"Existing mixed powder used in {record.get('mixingCode') or 'mixing'}",
            metadata={"sourceMixingId": source_id, "mixingCode": record.get("mixingCode")},
        )
        return str(source.get("output_inventory_lot_id") or "") or None

    @classmethod
    def _restore_existing_powder(cls, record: dict[str, Any], *, entity_id: str) -> None:
        source_type, source_id, used_kg = cls._existing_powder_usage(record)
        if used_kg <= 0:
            return
        source = cls._source_powder_row(source_id)
        if not source or not source.get("output_inventory_item_id"):
            return
        db.inventory_movement(
            inventory_item_id=str(source["output_inventory_item_id"]),
            inventory_lot_id=(
                str(source["output_inventory_lot_id"])
                if source.get("output_inventory_lot_id")
                else None
            ),
            quantity_delta=used_kg,
            movement_type="adjust",
            related_entity_type="mixing",
            related_entity_id=entity_id,
            reason="Mixing edit/delete restored existing powder",
            metadata={"sourceMixingId": source_id, "mixingCode": record.get("mixingCode")},
        )

    @classmethod
    def _produce_output(cls, row: dict[str, Any], record: dict[str, Any]) -> tuple[str, str | None]:
        item_id = row.get("output_inventory_item_id")
        lot_id = row.get("output_inventory_lot_id")
        mixing_id = str(row["id"])
        location_id = row.get("location_id")
        mixing_code = record.get("mixingCode") or row.get("mixing_code") or mixing_id
        product_name = record.get("productName") or record.get("mixedPowderName") or "Mixed powder"

        if not item_id:
            item = db.create_inventory_item(
                item_kind="mixed_powder",
                item_code=str(mixing_code),
                item_name=str(product_name),
                unit_of_measure="kg",
                metadata={"mixingId": mixing_id, "mixingCode": mixing_code},
            )
            item_id = str(item["id"])
        if not lot_id:
            lot = db.create_lot(
                inventory_item_id=str(item_id),
                lot_code=str(mixing_code),
                location_id=str(location_id) if location_id else None,
                source_document_type="mixing",
                source_document_id=mixing_id,
                metadata={"mixingCode": mixing_code},
            )
            lot_id = str(lot["id"]) if lot else None

        db.inventory_movement(
            inventory_item_id=str(item_id),
            inventory_lot_id=str(lot_id) if lot_id else None,
            location_id=str(location_id) if location_id else None,
            quantity_delta=db.as_decimal(record.get("totalKgInMixing")),
            movement_type="produce",
            related_entity_type="mixing",
            related_entity_id=mixing_id,
            reason="Mixing produced mixed powder",
            metadata={"mixingCode": mixing_code},
        )
        return str(item_id), str(lot_id) if lot_id else None

    @classmethod
    def _reverse_output(cls, row: dict[str, Any], record: dict[str, Any]) -> None:
        if not row.get("output_inventory_item_id"):
            return
        item_id = str(row["output_inventory_item_id"])
        lot_id = str(row["output_inventory_lot_id"]) if row.get("output_inventory_lot_id") else None
        qty = db.as_decimal(record.get("totalKgInMixing"))
        available = db.get_inventory_quantity(inventory_item_id=item_id, inventory_lot_id=lot_id)
        if qty > available:
            raise ServiceError(
                "Cannot edit or delete this mixing because NJP has already consumed its powder.",
                409,
            )
        db.inventory_movement(
            inventory_item_id=item_id,
            inventory_lot_id=lot_id,
            location_id=str(row["location_id"]) if row.get("location_id") else None,
            quantity_delta=-qty,
            movement_type="adjust",
            related_entity_type="mixing",
            related_entity_id=str(row["id"]),
            reason="Mixing edit/delete reversed output powder",
            metadata={"mixingCode": record.get("mixingCode")},
        )

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, records=records)
        location_id = db.ensure_location(cleaned.get("location") or cleaned.get("rackNo"))
        created = db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("mixings")
                    .insert(
                        {
                            "mixing_code": cleaned.get("mixingCode") or None,
                            "product_id": cleaned.get("productId"),
                            "location_id": location_id,
                            "location_text": cleaned.get("location") or cleaned.get("rackNo"),
                            "total_kg_in_mixing": db.decimal_str(cleaned.get("totalKgInMixing")),
                            "existing_mixed_powder_used_kg": db.decimal_str(
                                cleaned.get("existingMixedPowderUsedKg")
                            ),
                            "fresh_mixing_required_kg": db.decimal_str(cleaned.get("freshMixingRequiredKg")),
                            "calculated_fresh_raw_materials_total_kg": db.decimal_str(
                                cleaned.get("calculatedFreshRawMaterialsTotalKg")
                            ),
                            "total_mixed_qty_kg": db.decimal_str(cleaned.get("totalKgInMixing")),
                            "status": cleaned.get("status") or "completed",
                            "remarks": cleaned.get("remarks") or None,
                            "change_reason": cleaned.get("changeReason") or None,
                            "record_snapshot": to_json_value(cleaned),
                        }
                    )
                )
            ),
            "Mixing was not saved",
            500,
        )
        mixing_id = str(created["id"])
        record = {**cleaned, "id": mixing_id, "mixingCode": created.get("mixing_code")}
        source_lot_id = cls._consume_existing_powder(record, entity_id=mixing_id)
        cls._consume_raw_materials(record, entity_id=mixing_id)
        item_id, lot_id = cls._produce_output(created, record)
        record.update(
            {
                "outputInventoryItemId": item_id,
                "outputInventoryLotId": lot_id,
                "availableMixedPowderKg": record.get("totalKgInMixing"),
                "remainingMixedPowderKg": record.get("totalKgInMixing"),
            }
        )
        db.execute(
            db.client()
            .table("mixings")
            .update(
                {
                    "output_inventory_item_id": item_id,
                    "output_inventory_lot_id": lot_id,
                    "existing_mixed_powder_lot_id": source_lot_id,
                    "record_snapshot": to_json_value(record),
                }
            )
            .eq("id", mixing_id)
        )
        cls._insert_children(mixing_id, record)
        return cls.get(mixing_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = db.require_row(cls._row_by_id(item_id), "Mixing record not found")
        previous = cls._db_to_app(row)
        cls._reverse_output(row, previous)
        cls._restore_existing_powder(previous, entity_id=item_id)
        cls._restore_raw_materials(previous, entity_id=item_id)

        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, existing=previous, records=records)
        location_id = db.ensure_location(cleaned.get("location") or cleaned.get("rackNo"))
        record = {**cleaned, "id": item_id}
        source_lot_id = cls._consume_existing_powder(record, entity_id=item_id)
        cls._consume_raw_materials(record, entity_id=item_id)
        item_id_out, lot_id = cls._produce_output(row, record)
        record.update(
            {
                "outputInventoryItemId": item_id_out,
                "outputInventoryLotId": lot_id,
                "availableMixedPowderKg": record.get("totalKgInMixing"),
                "remainingMixedPowderKg": record.get("totalKgInMixing"),
            }
        )
        db.execute(
            db.client()
            .table("mixings")
            .update(
                {
                    "mixing_code": record.get("mixingCode"),
                    "product_id": record.get("productId"),
                    "location_id": location_id,
                    "location_text": record.get("location") or record.get("rackNo"),
                    "total_kg_in_mixing": db.decimal_str(record.get("totalKgInMixing")),
                    "existing_mixed_powder_lot_id": source_lot_id,
                    "existing_mixed_powder_used_kg": db.decimal_str(
                        record.get("existingMixedPowderUsedKg")
                    ),
                    "fresh_mixing_required_kg": db.decimal_str(record.get("freshMixingRequiredKg")),
                    "calculated_fresh_raw_materials_total_kg": db.decimal_str(
                        record.get("calculatedFreshRawMaterialsTotalKg")
                    ),
                    "total_mixed_qty_kg": db.decimal_str(record.get("totalKgInMixing")),
                    "output_inventory_item_id": item_id_out,
                    "output_inventory_lot_id": lot_id,
                    "status": record.get("status") or "completed",
                    "remarks": record.get("remarks") or None,
                    "change_reason": record.get("changeReason") or None,
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
        row = db.require_row(cls._row_by_id(item_id), "Mixing record not found")
        if db.one(
            db.execute(db.client().table("njp_runs").select("id").eq("mixing_id", item_id).limit(1))
        ):
            raise ServiceError("Cannot delete mixing because NJP records use it.", 409)
        previous = cls._db_to_app(row)
        cls._reverse_output(row, previous)
        cls._restore_existing_powder(previous, entity_id=item_id)
        cls._restore_raw_materials(previous, entity_id=item_id)
        db.execute(db.client().table("mixings").delete().eq("id", item_id))
        return {"success": True}


__all__ = ["DatabaseMixingService"]