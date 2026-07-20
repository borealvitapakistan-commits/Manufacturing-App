from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.manufacturing.services.mixing import MixingService
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value
from .rules import NJPRules

class NJPService(NJPRules):
    @classmethod
    def _normalize_session_date(cls, value: Any) -> str | None:
        """Convert supported session date values to ``YYYY-MM-DD``.

        The frontend may send a normal ISO date, an ISO datetime, a Python
        ``date``/``datetime`` object, or a JavaScript Unix timestamp in
        milliseconds. PostgreSQL ``date`` columns cannot accept the raw
        millisecond timestamp, so it is converted before insertion.
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
                    f"Invalid NJP session date: {value!r}.",
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
                f"Invalid NJP session date: {value!r}. "
                "Use YYYY-MM-DD, an ISO datetime, or a Unix timestamp."
            ),
            400,
        )

    @classmethod
    def _find_mixing(cls, mixing_id: str) -> dict[str, Any]:
        try:
            return MixingService.get(mixing_id)
        except ServiceError as error:
            if error.status_code == 404:
                raise ServiceError(
                    "Selected mixing was not found. Save the mixing first, then create NJP from it.",
                    404,
                )
            raise

    @classmethod
    def _row_by_id(cls, item_id: str) -> dict[str, Any] | None:
        return db.one(
            db.execute(
                db.client()
                .table("njp_runs")
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
        if row.get("output_capsule_inventory_item_id"):
            available = db.get_inventory_quantity(
                inventory_item_id=str(row["output_capsule_inventory_item_id"]),
                inventory_lot_id=(
                    str(row["output_capsule_lot_id"])
                    if row.get("output_capsule_lot_id")
                    else None
                ),
            )
        snapshot.update(
            {
                "id": item_id,
                "njpCode": row.get("njp_code"),
                "mixingId": str(row["mixing_id"]) if row.get("mixing_id") else "",
                "mixingCode": snapshot.get("mixingCode") or "",
                "capsuleSize": row.get("capsule_size"),
                "location": row.get("location_text") or snapshot.get("location") or "",
                "bucket": row.get("bucket") or snapshot.get("bucket") or "",
                "machineModel": row.get("machine_model") or snapshot.get("machineModel") or "",
                "machineSpeed": row.get("machine_speed") or snapshot.get("machineSpeed") or "",
                "rawMaterialReceivedKg": db.as_float(row.get("available_mixing_used_kg")),
                "availableMixingUsedKg": db.as_float(row.get("available_mixing_used_kg")),
                "targetFillWeightMg": db.as_float(row.get("target_fill_weight_mg")),
                "mixingMgTotal": db.as_float(row.get("mixing_mg_total")),
                "totalCapsulesFilledQty": int(db.as_decimal(row.get("total_capsules_filled_qty"))),
                "grossCapsulesFilledQty": int(db.as_decimal(row.get("total_capsules_filled_qty"))),
                "rejectedCapsulesQty": int(db.as_decimal(row.get("rejected_capsules_qty"))),
                "netCapsulesFilledQty": int(db.as_decimal(row.get("net_capsules_qty"))),
                "availableCapsulesQty": int(available),
                "remainingCapsulesQty": int(available),
                "emptyCapsuleUnitWeightMg": db.as_float(row.get("empty_capsule_weight_mg")),
                "totalCapsulesProducedKg": db.as_float(row.get("total_capsules_produced_kg")),
                "yieldPercent": db.as_float(row.get("yield_percent")),
                "status": cls.STATUS_MAP.get(
                    str(row.get("status") or "").lower(),
                    row.get("status") or "",
                ),
                "remarks": row.get("remarks") or snapshot.get("remarks") or "",
                "outputCapsuleInventoryItemId": (
                    str(row["output_capsule_inventory_item_id"])
                    if row.get("output_capsule_inventory_item_id")
                    else ""
                ),
                "outputCapsuleLotId": (
                    str(row["output_capsule_lot_id"])
                    if row.get("output_capsule_lot_id")
                    else ""
                ),
                "createdAt": db.timestamp_ms(row.get("created_at")) or snapshot.get("createdAt"),
                "updatedAt": db.timestamp_ms(row.get("updated_at")) or snapshot.get("updatedAt"),
            }
        )
        return snapshot

    @classmethod
    def list(
        cls,
        *,
        brand_id: str | None = None,
        product_id: str | None = None,
        mixing_id: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("njp_runs")
                .select("*")
                .order("created_at", desc=True)
                .limit(max(1, min(int(limit or 500), 2000)))
            )
        )
        records = [cls._db_to_app(row) for row in rows]
        if mixing_id:
            records = [record for record in records if str(record.get("mixingId")) == str(mixing_id)]
        if brand_id:
            records = [record for record in records if cls._record_has_brand(record, str(brand_id))]
        if product_id:
            records = [record for record in records if str(record.get("productId")) == str(product_id)]
        if search:
            query = str(search).strip().lower()
            records = [
                record
                for record in records
                if query
                in " ".join(
                    [
                        str(record.get("njpCode") or ""),
                        str(record.get("mixingCode") or ""),
                        str(record.get("mixingName") or ""),
                        str(record.get("productName") or ""),
                        str(record.get("location") or ""),
                        str(record.get("bucket") or ""),
                    ]
                ).lower()
            ]
        return records[:limit]

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        return cls._db_to_app(db.require_row(cls._row_by_id(item_id), "NJP record not found"))

    @classmethod
    def _insert_children(cls, njp_id: str, record: dict[str, Any]) -> None:
        db.execute(db.client().table("njp_sessions").delete().eq("njp_id", njp_id))
        db.execute(db.client().table("njp_load_checks").delete().eq("njp_id", njp_id))

        session_rows = []
        for index, row in enumerate(record.get("njpSessions") or [], start=1):
            session_date = cls._normalize_session_date(
                row.get("date") or row.get("sessionDate")
            )
            if not session_date:
                continue
            session_rows.append(
                {
                    "njp_id": njp_id,
                    "session_date": session_date,
                    "start_time": row.get("startTime") or None,
                    "end_time": row.get("endTime") or None,
                    "remarks": row.get("remarks") or row.get("dayRemarks"),
                    "sort_order": index,
                }
            )
        if session_rows:
            db.execute(db.client().table("njp_sessions").insert(session_rows))

        load_rows = []
        for row in record.get("loadChecks") or record.get("njpLoadChecks") or []:
            load_rows.append(
                {
                    "njp_id": njp_id,
                    "sample_count": row.get("sampleCount"),
                    "average_weight_mg": db.decimal_str(row.get("averageWeightMg") or 0),
                    "min_weight_mg": db.decimal_str(row.get("minWeightMg") or 0),
                    "max_weight_mg": db.decimal_str(row.get("maxWeightMg") or 0),
                    "operator_name": row.get("operatorName"),
                    "remarks": row.get("remarks"),
                    "metadata": to_json_value(row),
                }
            )
        if load_rows:
            db.execute(db.client().table("njp_load_checks").insert(load_rows))

    @staticmethod
    def _status_db(record: dict[str, Any]) -> str:
        value = str(record.get("status") or "").strip().lower()
        if value in {"completed", "njp completed"}:
            return "completed"
        return "underprocess"

    @classmethod
    def _mixing_row(cls, mixing_id: str) -> dict[str, Any]:
        return db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("mixings")
                    .select("*")
                    .eq("id", mixing_id)
                    .limit(1)
                )
            ),
            "Selected mixing was not found.",
            400,
        )

    @classmethod
    def _consume_mixing(cls, record: dict[str, Any], *, entity_id: str) -> str | None:
        mixing_id, used_kg = cls._njp_usage(record)
        if not mixing_id or used_kg <= 0:
            raise ServiceError("Enter how many KG of available mixing will be used for NJP.", 400)
        source = cls._mixing_row(str(mixing_id))
        item_id = source.get("output_inventory_item_id")
        if not item_id:
            raise ServiceError("Selected mixing has no available powder inventory.", 400)
        db.consume_inventory_quantity(
            inventory_item_id=str(item_id),
            quantity=used_kg,
            related_entity_type="njp",
            related_entity_id=entity_id,
            reason=f"Mixing powder used in {record.get('njpCode') or 'NJP'}",
            metadata={"mixingId": mixing_id, "mixingCode": record.get("mixingCode")},
        )
        return str(source.get("output_inventory_lot_id") or "") or None

    @classmethod
    def _restore_mixing(cls, record: dict[str, Any], *, entity_id: str) -> None:
        mixing_id, used_kg = cls._njp_usage(record)
        if not mixing_id or used_kg <= 0:
            return
        source = cls._mixing_row(str(mixing_id))
        if not source.get("output_inventory_item_id"):
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
            related_entity_type="njp",
            related_entity_id=entity_id,
            reason="NJP edit/delete restored mixing powder",
            metadata={"mixingId": mixing_id, "njpCode": record.get("njpCode")},
        )

    @classmethod
    def _produce_capsules(cls, row: dict[str, Any], record: dict[str, Any]) -> tuple[str, str | None]:
        item_id = row.get("output_capsule_inventory_item_id")
        lot_id = row.get("output_capsule_lot_id")
        njp_id = str(row["id"])
        location_id = row.get("location_id")
        njp_code = record.get("njpCode") or row.get("njp_code") or njp_id
        product_name = record.get("productName") or record.get("mixingName") or "Capsules"

        if not item_id:
            item = db.create_inventory_item(
                item_kind="capsule_bulk",
                item_code=str(njp_code),
                item_name=f"{product_name} capsules",
                unit_of_measure="each",
                metadata={"njpId": njp_id, "njpCode": njp_code},
            )
            item_id = str(item["id"])
        if not lot_id:
            lot = db.create_lot(
                inventory_item_id=str(item_id),
                lot_code=str(njp_code),
                location_id=str(location_id) if location_id else None,
                source_document_type="njp",
                source_document_id=njp_id,
                metadata={"njpCode": njp_code},
            )
            lot_id = str(lot["id"]) if lot else None

        db.inventory_movement(
            inventory_item_id=str(item_id),
            inventory_lot_id=str(lot_id) if lot_id else None,
            location_id=str(location_id) if location_id else None,
            quantity_delta=db.as_decimal(record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty")),
            movement_type="produce",
            related_entity_type="njp",
            related_entity_id=njp_id,
            reason="NJP produced bulk capsules",
            metadata={"njpCode": njp_code},
        )
        return str(item_id), str(lot_id) if lot_id else None

    @classmethod
    def _reverse_output(cls, row: dict[str, Any], record: dict[str, Any]) -> None:
        if not row.get("output_capsule_inventory_item_id"):
            return
        item_id = str(row["output_capsule_inventory_item_id"])
        lot_id = str(row["output_capsule_lot_id"]) if row.get("output_capsule_lot_id") else None
        qty = db.as_decimal(record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty"))
        available = db.get_inventory_quantity(inventory_item_id=item_id, inventory_lot_id=lot_id)
        if qty > available:
            raise ServiceError(
                "Cannot edit or delete this NJP because Assembly has already consumed capsules from it.",
                409,
            )
        db.inventory_movement(
            inventory_item_id=item_id,
            inventory_lot_id=lot_id,
            location_id=str(row["location_id"]) if row.get("location_id") else None,
            quantity_delta=-qty,
            movement_type="adjust",
            related_entity_type="njp",
            related_entity_id=str(row["id"]),
            reason="NJP edit/delete reversed capsule output",
            metadata={"njpCode": record.get("njpCode")},
        )

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, records=records)
        location_id = db.ensure_location(cleaned.get("location"))
        created = db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("njp_runs")
                    .insert(
                        {
                            "njp_code": cleaned.get("njpCode") or None,
                            "mixing_id": cleaned.get("mixingId"),
                            "capsule_size": cleaned.get("capsuleSize") or "00",
                            "location_id": location_id,
                            "location_text": cleaned.get("location"),
                            "bucket": cleaned.get("bucket"),
                            "machine_model": cleaned.get("machineModel"),
                            "machine_speed": cleaned.get("machineSpeed"),
                            "available_mixing_used_kg": db.decimal_str(
                                cleaned.get("availableMixingUsedKg")
                                or cleaned.get("rawMaterialReceivedKg")
                            ),
                            "target_fill_weight_mg": db.decimal_str(cleaned.get("targetFillWeightMg")),
                            "mixing_mg_total": db.decimal_str(cleaned.get("mixingMgTotal")),
                            "total_capsules_filled_qty": db.decimal_str(
                                cleaned.get("grossCapsulesFilledQty")
                                or cleaned.get("totalCapsulesFilledQty")
                            ),
                            "rejected_capsules_qty": db.decimal_str(cleaned.get("rejectedCapsulesQty")),
                            "net_capsules_qty": db.decimal_str(
                                cleaned.get("netCapsulesFilledQty")
                                or cleaned.get("totalCapsulesFilledQty")
                            ),
                            "empty_capsule_weight_mg": db.decimal_str(
                                cleaned.get("emptyCapsuleUnitWeightMg") or cls.EMPTY_CAPSULE_UNIT_WEIGHT_MG
                            ),
                            "total_capsules_produced_kg": db.decimal_str(
                                cleaned.get("totalCapsulesProducedKg")
                            ),
                            "yield_percent": db.decimal_str(cleaned.get("yieldPercent") or 0, "0.0001"),
                            "status": cls._status_db(cleaned),
                            "remarks": cleaned.get("remarks"),
                            "record_snapshot": to_json_value(cleaned),
                        }
                    )
                )
            ),
            "NJP was not saved",
            500,
        )
        njp_id = str(created["id"])
        record = {**cleaned, "id": njp_id, "njpCode": created.get("njp_code")}
        input_lot_id = cls._consume_mixing(record, entity_id=njp_id)
        item_id, lot_id = cls._produce_capsules(created, record)
        record.update(
            {
                "outputCapsuleInventoryItemId": item_id,
                "outputCapsuleLotId": lot_id,
                "availableCapsulesQty": record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty"),
                "remainingCapsulesQty": record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty"),
            }
        )
        db.execute(
            db.client()
            .table("njp_runs")
            .update(
                {
                    "input_mixed_powder_lot_id": input_lot_id,
                    "output_capsule_inventory_item_id": item_id,
                    "output_capsule_lot_id": lot_id,
                    "record_snapshot": to_json_value(record),
                }
            )
            .eq("id", njp_id)
        )
        cls._insert_children(njp_id, record)
        return cls.get(njp_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = db.require_row(cls._row_by_id(item_id), "NJP record not found")
        previous = cls._db_to_app(row)
        cls._reverse_output(row, previous)
        cls._restore_mixing(previous, entity_id=item_id)
        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, existing=previous, records=records)
        location_id = db.ensure_location(cleaned.get("location"))
        record = {**cleaned, "id": item_id}
        input_lot_id = cls._consume_mixing(record, entity_id=item_id)
        item_id_out, lot_id = cls._produce_capsules(row, record)
        record.update(
            {
                "outputCapsuleInventoryItemId": item_id_out,
                "outputCapsuleLotId": lot_id,
                "availableCapsulesQty": record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty"),
                "remainingCapsulesQty": record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty"),
            }
        )
        db.execute(
            db.client()
            .table("njp_runs")
            .update(
                {
                    "njp_code": record.get("njpCode"),
                    "mixing_id": record.get("mixingId"),
                    "input_mixed_powder_lot_id": input_lot_id,
                    "output_capsule_inventory_item_id": item_id_out,
                    "output_capsule_lot_id": lot_id,
                    "capsule_size": record.get("capsuleSize") or "00",
                    "location_id": location_id,
                    "location_text": record.get("location"),
                    "bucket": record.get("bucket"),
                    "machine_model": record.get("machineModel"),
                    "machine_speed": record.get("machineSpeed"),
                    "available_mixing_used_kg": db.decimal_str(
                        record.get("availableMixingUsedKg") or record.get("rawMaterialReceivedKg")
                    ),
                    "target_fill_weight_mg": db.decimal_str(record.get("targetFillWeightMg")),
                    "mixing_mg_total": db.decimal_str(record.get("mixingMgTotal")),
                    "total_capsules_filled_qty": db.decimal_str(
                        record.get("grossCapsulesFilledQty") or record.get("totalCapsulesFilledQty")
                    ),
                    "rejected_capsules_qty": db.decimal_str(record.get("rejectedCapsulesQty")),
                    "net_capsules_qty": db.decimal_str(
                        record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty")
                    ),
                    "empty_capsule_weight_mg": db.decimal_str(
                        record.get("emptyCapsuleUnitWeightMg") or cls.EMPTY_CAPSULE_UNIT_WEIGHT_MG
                    ),
                    "total_capsules_produced_kg": db.decimal_str(record.get("totalCapsulesProducedKg")),
                    "yield_percent": db.decimal_str(record.get("yieldPercent") or 0, "0.0001"),
                    "status": cls._status_db(record),
                    "remarks": record.get("remarks"),
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
        row = db.require_row(cls._row_by_id(item_id), "NJP record not found")
        if db.one(
            db.execute(db.client().table("assemblies").select("id").eq("njp_id", item_id).limit(1))
        ):
            raise ServiceError("Cannot delete NJP because Assembly records use it.", 409)
        previous = cls._db_to_app(row)
        cls._reverse_output(row, previous)
        cls._restore_mixing(previous, entity_id=item_id)
        db.execute(db.client().table("njp_runs").delete().eq("id", item_id))
        return {"success": True}

__all__ = ["NJPService"]