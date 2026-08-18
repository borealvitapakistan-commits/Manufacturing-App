from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.manufacturing.services.mixing import MixingService
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value
from .rules import EncapsulationRules


class EncapsulationService(EncapsulationRules):
    TABLE = "encapsulations"
    SESSIONS_TABLE = "encapsulation_sessions"
    LOAD_CHECKS_TABLE = "encapsulation_load_checks"
    FK_COLUMN = "encapsulation_id"
    CODE_COLUMN = "encapsulation_code"

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
                    f"Invalid Encapsulation session date: {value!r}.",
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
                f"Invalid Encapsulation session date: {value!r}. "
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
                    "Selected mixing was not found. Save the mixing first, then create Encapsulation from it.",
                    404,
                )
            raise

    @classmethod
    def _row_by_id(cls, item_id: str) -> dict[str, Any] | None:
        return db.one(
            db.execute(
                db.client()
                .table(cls.TABLE)
                .select("*")
                .eq("id", item_id)
                .limit(1)
            )
        )

    @classmethod
    def _session_rows(cls, item_id: str) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table(cls.SESSIONS_TABLE)
                .select("*")
                .eq(cls.FK_COLUMN, item_id)
                .order("sort_order")
            )
        )
        return cls._shape_session_rows(rows)

    @classmethod
    def _session_rows_bulk(cls, item_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """Fetch encapsulation_sessions for many encapsulations in one query."""
        if not item_ids:
            return {}
        rows = db.data(
            db.execute(
                db.client()
                .table(cls.SESSIONS_TABLE)
                .select("*")
                .in_(cls.FK_COLUMN, item_ids)
                .order("sort_order")
            )
        )
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(str(row.get(cls.FK_COLUMN)), []).append(row)
        return {item_id: cls._shape_session_rows(group) for item_id, group in grouped.items()}

    @staticmethod
    def _shape_session_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sessions: list[dict[str, Any]] = []
        for row in rows:
            sessions.append(
                to_json_value(
                    {
                        "date": row.get("session_date"),
                        "startDate": row.get("session_date"),
                        "startTime": db.hhmm(row.get("start_time")),
                        "endDate": row.get("session_date"),
                        "endTime": db.hhmm(row.get("end_time")),
                        "remarks": row.get("remarks") or "",
                    }
                )
            )
        return sessions

    @staticmethod
    def _mg_or_none(value: Any) -> float | None:
        return db.as_float(value) if value is not None else None

    @classmethod
    def _split_checked_at(cls, value: Any) -> tuple[str | None, str | None]:
        """Splits the legacy `checked_at` timestamp into (date, time) strings,
        for load-check rows recorded before check_date/check_time existed as
        their own columns (016 backfilled these only where `metadata` was set).
        """
        if not value:
            return None, None
        try:
            parsed = (
                value
                if isinstance(value, datetime)
                else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            )
            if timezone.is_aware(parsed):
                parsed = timezone.localtime(parsed, timezone.get_current_timezone())
            return parsed.date().isoformat(), parsed.strftime("%H:%M")
        except (ValueError, TypeError):
            return None, None

    @classmethod
    def _load_check_rows(cls, item_id: str) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table(cls.LOAD_CHECKS_TABLE)
                .select("*")
                .eq(cls.FK_COLUMN, item_id)
                .order("created_at")
            )
        )
        return cls._shape_load_check_rows(rows)

    @classmethod
    def _load_check_rows_bulk(cls, item_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """Fetch encapsulation_load_checks for many encapsulations in one query.

        Avoids an N+1 round trip per row on list() - the same reasoning as
        Assembly's _brand_lot_rows_bulk.
        """
        if not item_ids:
            return {}
        rows = db.data(
            db.execute(
                db.client()
                .table(cls.LOAD_CHECKS_TABLE)
                .select("*")
                .in_(cls.FK_COLUMN, item_ids)
                .order("created_at")
            )
        )
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(str(row.get(cls.FK_COLUMN)), []).append(row)
        return {item_id: cls._shape_load_check_rows(group) for item_id, group in grouped.items()}

    @classmethod
    def _shape_load_check_rows(cls, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        checks: list[dict[str, Any]] = []
        for row in rows:
            metadata = dict(row.get("metadata") or {})
            avg_mg = db.as_float(row.get("avg_mg") or row.get("average_weight_mg"))
            fallback_date, fallback_time = cls._split_checked_at(row.get("checked_at"))
            check_date = row.get("check_date") or fallback_date
            check_time = row.get("check_time") or fallback_time
            checks.append(
                to_json_value(
                    {
                        **metadata,
                        "checkDate": check_date,
                        "date": check_date,
                        "checkTime": check_time,
                        "time": check_time,
                        "loadLabel": row.get("load_label") or metadata.get("loadLabel"),
                        "load": row.get("load_label") or metadata.get("load"),
                        "w1Mg": cls._mg_or_none(row.get("w1_mg")),
                        "w2Mg": cls._mg_or_none(row.get("w2_mg")),
                        "w3Mg": cls._mg_or_none(row.get("w3_mg")),
                        "w4Mg": cls._mg_or_none(row.get("w4_mg")),
                        "w5Mg": cls._mg_or_none(row.get("w5_mg")),
                        "avgMg": avg_mg,
                        "avgWeightMg": avg_mg,
                        "averageWeightMg": avg_mg,
                        "minWeightMg": cls._mg_or_none(row.get("min_weight_mg")),
                        "maxWeightMg": cls._mg_or_none(row.get("max_weight_mg")),
                        "sampleCount": row.get("sample_count"),
                        "operatorName": row.get("operator_name") or "",
                        "remarks": row.get("remarks") or "",
                    }
                )
        )
        return checks

    @classmethod
    def _product_code_products(cls) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("products")
                .select("id, product_name, product_code, npn")
                .limit(5000)
            )
        )
        products: list[dict[str, Any]] = []
        for row in rows:
            product_name = row.get("product_name") or row.get("product_code") or row.get("npn") or ""
            products.append(
                {
                    "id": str(row.get("id") or ""),
                    "name": product_name,
                    "productName": product_name,
                    "product_name": row.get("product_name") or "",
                    "productCode": row.get("product_code") or "",
                    "product_code": row.get("product_code") or "",
                    "code": row.get("product_code") or row.get("npn") or "",
                    "npn": row.get("npn") or "",
                }
            )
        return products

    @classmethod
    def _db_to_app(
        cls,
        row: dict[str, Any],
        *,
        session_rows: list[dict[str, Any]] | None = None,
        load_check_rows: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
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
        code = (
            row.get(cls.CODE_COLUMN)
            or snapshot.get("encapsulationCode")
            or snapshot.get("njpCode")
            or ""
        )
        sessions = (
            snapshot.get("encapsulationSessions")
            or snapshot.get("njpSessions")
            or snapshot.get("timeLogs")
            or (session_rows if session_rows is not None else cls._session_rows(item_id))
        )
        # Prefer the live encapsulation_load_checks rows - they're the real,
        # queryable source of truth and (after the check_date/check_time/
        # w1-w5/min/max fallbacks in _load_check_rows) are more complete than
        # a record_snapshot blob frozen by whatever payload shape the
        # frontend happened to submit at save time. Snapshot only fills in
        # for legacy records with no child rows at all.
        # (load_check_rows/session_rows are pre-fetched in bulk by list() to
        # avoid an N+1 query per row - get() leaves them None to fetch live.)
        resolved_load_checks = (
            load_check_rows if load_check_rows is not None else cls._load_check_rows(item_id)
        )
        load_checks = resolved_load_checks or (
            snapshot.get("encapsulationLoadChecks")
            or snapshot.get("loadChecks")
            or snapshot.get("njpLoadChecks")
            or []
        )
        mixing_used_kg = (
            snapshot.get("mixingUsedInEncapsulationKg")
            or snapshot.get("mixingUsedInNJPkg")
            or db.as_float(row.get("available_mixing_used_kg"))
        )
        mixing_after_kg = (
            snapshot.get("mixingAvailableAfterEncapsulationKg")
            or snapshot.get("mixingAvailableAfterNJPkg")
            # Older records only ever captured this generic "currently
            # available" figure, under a name that predates the
            # before/after split.
            or snapshot.get("mixingAvailableKg")
        )
        # "Before" was never captured directly in some older snapshots, but
        # it's always derivable from the two figures that were: before =
        # used + after.
        mixing_before_kg = (
            snapshot.get("mixingAvailableBeforeEncapsulationKg")
            or snapshot.get("mixingAvailableBeforeNJPkg")
            or (
                db.as_float(mixing_used_kg) + db.as_float(mixing_after_kg)
                if mixing_after_kg is not None
                else None
            )
        )
        snapshot.update(
            {
                "id": item_id,
                "encapsulationCode": code,
                "njpCode": code,
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
                "mixingAvailableBeforeEncapsulationKg": mixing_before_kg,
                "mixingUsedInEncapsulationKg": mixing_used_kg,
                "mixingAvailableAfterEncapsulationKg": mixing_after_kg,
                "mixingAvailableBeforeNJPkg": mixing_before_kg,
                "mixingUsedInNJPkg": mixing_used_kg,
                "mixingAvailableAfterNJPkg": mixing_after_kg,
                "emptyCapsuleUnitWeightMg": db.as_float(row.get("empty_capsule_weight_mg")),
                "totalCapsulesProducedKg": db.as_float(row.get("total_capsules_produced_kg")),
                "yieldPercent": db.as_float(row.get("yield_percent")),
                "status": cls.STATUS_MAP.get(
                    str(row.get("status") or "").lower(),
                    row.get("status") or "",
                ),
                "remarks": row.get("remarks") or snapshot.get("remarks") or "",
                "dusterCheck": (
                    row.get("duster_check")
                    if row.get("duster_check") is not None
                    else bool(snapshot.get("dusterCheck"))
                ),
                "vacuumCheck": (
                    row.get("vacuum_check")
                    if row.get("vacuum_check") is not None
                    else bool(snapshot.get("vacuumCheck"))
                ),
                "temperatureC": (
                    db.as_float(row.get("temperature_c"))
                    if row.get("temperature_c") is not None
                    else snapshot.get("temperatureC")
                ),
                "humidityPercent": (
                    db.as_float(row.get("humidity_percent"))
                    if row.get("humidity_percent") is not None
                    else snapshot.get("humidityPercent")
                ),
                "operatorName": row.get("operator_name") or snapshot.get("operatorName") or "",
                "reason": row.get("reason") or snapshot.get("reason") or "",
                "outputCapsuleInventoryItemId": (
                    str(row["output_capsule_inventory_item_id"])
                    if row.get("output_capsule_inventory_item_id")
                    else ""
                ),
                "encapsulationSessions": sessions,
                "encapsulationTimeLogs": sessions,
                "njpSessions": sessions,
                "njpTimeLogs": sessions,
                "timeLogs": sessions,
                "encapsulationLoadChecks": load_checks,
                "njpLoadChecks": load_checks,
                "loadChecks": load_checks,
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
                .table(cls.TABLE)
                .select("*")
                .order("created_at", desc=True)
                .limit(max(1, min(int(limit or 500), 2000)))
            )
        )
        item_ids = [str(row["id"]) for row in rows]
        sessions_by_id = cls._session_rows_bulk(item_ids)
        load_checks_by_id = cls._load_check_rows_bulk(item_ids)
        records = [
            cls._db_to_app(
                row,
                session_rows=sessions_by_id.get(str(row["id"]), []),
                load_check_rows=load_checks_by_id.get(str(row["id"]), []),
            )
            for row in rows
        ]
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
                        str(record.get("encapsulationCode") or ""),
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
        return cls._db_to_app(
            db.require_row(cls._row_by_id(item_id), "Encapsulation record not found")
        )

    @classmethod
    def _insert_children(cls, encapsulation_id: str, record: dict[str, Any]) -> None:
        db.execute(
            db.client()
            .table(cls.SESSIONS_TABLE)
            .delete()
            .eq(cls.FK_COLUMN, encapsulation_id)
        )
        db.execute(
            db.client()
            .table(cls.LOAD_CHECKS_TABLE)
            .delete()
            .eq(cls.FK_COLUMN, encapsulation_id)
        )

        session_rows = []
        for index, row in enumerate(
            record.get("encapsulationSessions")
            or record.get("njpSessions")
            or [],
            start=1,
        ):
            session_date = cls._normalize_session_date(
                row.get("date") or row.get("sessionDate")
            )
            if not session_date:
                continue
            session_rows.append(
                {
                    cls.FK_COLUMN: encapsulation_id,
                    "session_date": session_date,
                    "start_time": row.get("startTime") or None,
                    "end_time": row.get("endTime") or None,
                    "remarks": row.get("remarks") or row.get("dayRemarks"),
                    "sort_order": index,
                }
            )
        if session_rows:
            db.execute(db.client().table(cls.SESSIONS_TABLE).insert(session_rows))

        load_rows = []
        for row in (
            record.get("encapsulationLoadChecks")
            or record.get("loadChecks")
            or record.get("njpLoadChecks")
            or []
        ):
            average_weight = row.get("avgMg") or row.get("avgWeightMg") or row.get("averageWeightMg")
            sample_count = row.get("sampleCount") or 5
            load_rows.append(
                {
                    cls.FK_COLUMN: encapsulation_id,
                    "check_date": row.get("checkDate") or row.get("date") or None,
                    "check_time": row.get("checkTime") or row.get("time") or None,
                    "load_label": row.get("loadLabel") or row.get("load") or None,
                    "w1_mg": db.decimal_str(row.get("w1Mg")),
                    "w2_mg": db.decimal_str(row.get("w2Mg")),
                    "w3_mg": db.decimal_str(row.get("w3Mg")),
                    "w4_mg": db.decimal_str(row.get("w4Mg")),
                    "w5_mg": db.decimal_str(row.get("w5Mg")),
                    "avg_mg": db.decimal_str(average_weight),
                    "sample_count": sample_count,
                    "average_weight_mg": db.decimal_str(average_weight),
                    "min_weight_mg": db.decimal_str(row.get("minWeightMg")),
                    "max_weight_mg": db.decimal_str(row.get("maxWeightMg")),
                    "operator_name": row.get("operatorName"),
                    "remarks": row.get("remarks"),
                    "metadata": to_json_value(row),
                }
            )
        if load_rows:
            db.execute(db.client().table(cls.LOAD_CHECKS_TABLE).insert(load_rows))

    @staticmethod
    def _status_db(record: dict[str, Any]) -> str:
        value = str(record.get("status") or "").strip().lower()
        if value in {"completed", "njp completed", "encapsulation completed"}:
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
        mixing_id, used_kg = cls._encapsulation_usage(record)
        if not mixing_id or used_kg <= 0:
            raise ServiceError("Enter how many KG of available mixing will be used for Encapsulation.", 400)
        source = cls._mixing_row(str(mixing_id))
        item_id = source.get("output_inventory_item_id")
        if not item_id:
            raise ServiceError("Selected mixing has no available powder inventory.", 400)
        db.consume_inventory_quantity(
            inventory_item_id=str(item_id),
            quantity=used_kg,
            related_entity_type="encapsulation",
            related_entity_id=entity_id,
            reason=(
                f"Mixing powder used in "
                f"{record.get('encapsulationCode') or record.get('njpCode') or 'Encapsulation'}"
            ),
            metadata={
                "mixingId": mixing_id,
                "mixingCode": record.get("mixingCode"),
                "encapsulationCode": record.get("encapsulationCode") or record.get("njpCode"),
                "njpCode": record.get("njpCode") or record.get("encapsulationCode"),
            },
        )
        return str(source.get("output_inventory_lot_id") or "") or None

    @classmethod
    def _restore_mixing(cls, record: dict[str, Any], *, entity_id: str) -> None:
        mixing_id, used_kg = cls._encapsulation_usage(record)
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
            related_entity_type="encapsulation",
            related_entity_id=entity_id,
            reason="Encapsulation edit/delete restored mixing powder",
            metadata={
                "mixingId": mixing_id,
                "encapsulationCode": record.get("encapsulationCode") or record.get("njpCode"),
                "njpCode": record.get("njpCode") or record.get("encapsulationCode"),
            },
        )

    @classmethod
    def _produce_capsules(cls, row: dict[str, Any], record: dict[str, Any]) -> tuple[str, str | None]:
        item_id = row.get("output_capsule_inventory_item_id")
        lot_id = row.get("output_capsule_lot_id")
        encapsulation_id = str(row["id"])
        location_id = row.get("location_id")
        encapsulation_code = (
            record.get("encapsulationCode")
            or record.get("njpCode")
            or row.get(cls.CODE_COLUMN)
            or encapsulation_id
        )
        product_name = record.get("productName") or record.get("mixingName") or "Capsules"

        if not item_id:
            item = db.create_inventory_item(
                item_kind="capsule_bulk",
                item_code=str(encapsulation_code),
                item_name=f"{product_name} capsules",
                unit_of_measure="each",
                metadata={
                    "encapsulationId": encapsulation_id,
                    "encapsulationCode": encapsulation_code,
                    "njpId": encapsulation_id,
                    "njpCode": encapsulation_code,
                },
            )
            item_id = str(item["id"])
        if not lot_id:
            lot = db.create_lot(
                inventory_item_id=str(item_id),
                lot_code=str(encapsulation_code),
                location_id=str(location_id) if location_id else None,
                source_document_type="encapsulation",
                source_document_id=encapsulation_id,
                metadata={
                    "encapsulationCode": encapsulation_code,
                    "njpCode": encapsulation_code,
                },
            )
            lot_id = str(lot["id"]) if lot else None

        db.inventory_movement(
            inventory_item_id=str(item_id),
            inventory_lot_id=str(lot_id) if lot_id else None,
            location_id=str(location_id) if location_id else None,
            quantity_delta=db.as_decimal(record.get("netCapsulesFilledQty") or record.get("totalCapsulesFilledQty")),
            movement_type="produce",
            related_entity_type="encapsulation",
            related_entity_id=encapsulation_id,
            reason="Encapsulation produced bulk capsules",
            metadata={
                "encapsulationCode": encapsulation_code,
                "njpCode": encapsulation_code,
            },
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
                "Cannot edit or delete this Encapsulation because Assembly has already consumed capsules from it.",
                409,
            )
        db.inventory_movement(
            inventory_item_id=item_id,
            inventory_lot_id=lot_id,
            location_id=str(row["location_id"]) if row.get("location_id") else None,
            quantity_delta=-qty,
            movement_type="adjust",
            related_entity_type="encapsulation",
            related_entity_id=str(row["id"]),
            reason="Encapsulation edit/delete reversed capsule output",
            metadata={
                "encapsulationCode": record.get("encapsulationCode") or record.get("njpCode"),
                "njpCode": record.get("njpCode") or record.get("encapsulationCode"),
            },
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
                    .table(cls.TABLE)
                    .insert(
                        {
                            cls.CODE_COLUMN: (
                                cleaned.get("encapsulationCode")
                                or cleaned.get("njpCode")
                                or None
                            ),
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
                            "duster_check": bool(cleaned.get("dusterCheck")),
                            "vacuum_check": bool(cleaned.get("vacuumCheck")),
                            "temperature_c": (
                                db.decimal_str(cleaned.get("temperatureC"))
                                if cleaned.get("temperatureC") not in (None, "")
                                else None
                            ),
                            "humidity_percent": (
                                db.decimal_str(cleaned.get("humidityPercent"))
                                if cleaned.get("humidityPercent") not in (None, "")
                                else None
                            ),
                            "operator_name": cleaned.get("operatorName") or None,
                            "reason": cleaned.get("reason") or None,
                            "record_snapshot": to_json_value(cleaned),
                        }
                    )
                )
            ),
            "Encapsulation was not saved",
            500,
        )
        encapsulation_id = str(created["id"])
        generated_code = created.get(cls.CODE_COLUMN)
        record = {
            **cleaned,
            "id": encapsulation_id,
            "encapsulationCode": generated_code,
            "njpCode": generated_code,
        }
        input_lot_id = cls._consume_mixing(record, entity_id=encapsulation_id)
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
            .table(cls.TABLE)
            .update(
                {
                    "input_mixed_powder_lot_id": input_lot_id,
                    "output_capsule_inventory_item_id": item_id,
                    "output_capsule_lot_id": lot_id,
                    "record_snapshot": to_json_value(record),
                }
            )
            .eq("id", encapsulation_id)
        )
        cls._insert_children(encapsulation_id, record)
        return cls.get(encapsulation_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = db.require_row(cls._row_by_id(item_id), "Encapsulation record not found")
        previous = cls._db_to_app(row)
        cls._reverse_output(row, previous)
        cls._restore_mixing(previous, entity_id=item_id)
        records = cls.list(limit=2000)
        cleaned = cls._clean_payload(payload, existing=previous, records=records)
        location_id = db.ensure_location(cleaned.get("location"))
        record = {
            **cleaned,
            "id": item_id,
            "encapsulationCode": cleaned.get("encapsulationCode") or cleaned.get("njpCode"),
            "njpCode": cleaned.get("njpCode") or cleaned.get("encapsulationCode"),
        }
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
            .table(cls.TABLE)
            .update(
                {
                    cls.CODE_COLUMN: (
                        record.get("encapsulationCode")
                        or record.get("njpCode")
                    ),
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
                    "duster_check": bool(record.get("dusterCheck")),
                    "vacuum_check": bool(record.get("vacuumCheck")),
                    "temperature_c": (
                        db.decimal_str(record.get("temperatureC"))
                        if record.get("temperatureC") not in (None, "")
                        else None
                    ),
                    "humidity_percent": (
                        db.decimal_str(record.get("humidityPercent"))
                        if record.get("humidityPercent") not in (None, "")
                        else None
                    ),
                    "operator_name": record.get("operatorName") or None,
                    "reason": record.get("reason") or None,
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
        row = db.require_row(cls._row_by_id(item_id), "Encapsulation record not found")
        if db.one(
            db.execute(
                db.client()
                .table("assemblies")
                .select("id")
                .eq("encapsulation_id", item_id)
                .limit(1)
            )
        ):
            raise ServiceError("Cannot delete Encapsulation because Assembly records use it.", 409)
        previous = cls._db_to_app(row)
        cls._reverse_output(row, previous)
        cls._restore_mixing(previous, entity_id=item_id)
        db.execute(db.client().table(cls.TABLE).delete().eq("id", item_id))
        return {"success": True}

NJPService = EncapsulationService

__all__ = ["EncapsulationService", "NJPService"]
