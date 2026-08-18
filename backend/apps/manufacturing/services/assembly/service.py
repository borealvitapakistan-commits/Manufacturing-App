from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.inventory.services.bottles_lids import BOTTLE_TYPES, CAPSULE_TYPES, BottleLidService
from apps.inventory.services.labels import LabelService
from apps.manufacturing.services.encapsulation import EncapsulationService
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value
from .rules import AssemblyRules

class AssemblyService(AssemblyRules):
    @classmethod
    def _find_njp(cls, njp_id: str) -> dict[str, Any]:
        try:
            return EncapsulationService.get(njp_id)
        except ServiceError as error:
            if error.status_code == 404:
                raise ServiceError(
                    "Selected Encapsulation record was not found. Save Encapsulation first, then create Assembly from it.",
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
    def _time_log_rows(cls, assembly_id: str) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("assembly_sessions")
                .select("*")
                .eq("assembly_id", assembly_id)
                .order("sort_order")
            )
        )
        return cls._shape_time_log_rows(rows)

    @classmethod
    def _time_log_rows_bulk(cls, assembly_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """Fetch assembly_sessions for many assemblies in one query."""
        if not assembly_ids:
            return {}
        rows = db.data(
            db.execute(
                db.client()
                .table("assembly_sessions")
                .select("*")
                .in_("assembly_id", assembly_ids)
                .order("sort_order")
            )
        )
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(str(row.get("assembly_id")), []).append(row)
        return {assembly_id: cls._shape_time_log_rows(group) for assembly_id, group in grouped.items()}

    @staticmethod
    def _shape_time_log_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
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
            for row in rows
        ]

    @classmethod
    def _available_bottle_quantity(cls, brand_lots: list[dict[str, Any]]) -> int:
        """Live remaining bottle count across this assembly's finished-goods lots.

        total_bottles_made on the assemblies row is the fixed historical
        production number (mirrors totalCapsulesFilledQty on Encapsulation) -
        it never changes once produced. The live remaining stock lives in
        inventory_balances against each brand lot's finished_good inventory
        item, exactly like Encapsulation's availableCapsulesQty.
        """
        total = Decimal(0)
        for lot in brand_lots:
            item_id = lot.get("finished_good_inventory_item_id")
            if not item_id:
                continue
            lot_id = lot.get("finished_good_lot_id")
            total += db.get_inventory_quantity(
                inventory_item_id=str(item_id),
                inventory_lot_id=str(lot_id) if lot_id else None,
            )
        return int(total)

    @classmethod
    def _db_to_app(
        cls,
        row: dict[str, Any],
        *,
        brand_lots: list[dict[str, Any]] | None = None,
        session_rows: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        snapshot = dict(row.get("record_snapshot") or {})
        assembly_id = str(row["id"])
        if brand_lots is None:
            brand_lots = cls._brand_lot_rows(assembly_id)
        available_bottle_quantity = cls._available_bottle_quantity(brand_lots)
        brand_batch_codes: list[dict[str, Any]] = []
        for item in brand_lots:
            brand = item.get("brands") or {}
            brand_batch_codes.append(
                {
                    "brandId": str(item.get("brand_id") or ""),
                    "brandName": brand.get("name") or "",
                    "codePrefix": brand.get("code_prefix") or "",
                    "batchCode": item.get("batch_code") or "",
                    "assemblyCode": item.get("assembly_code") or item.get("batch_code") or "",
                    "bottlesQty": item.get("bottles_qty") or 0,
                    "comments": item.get("comments") or "",
                }
            )

        # Prefer the live assembly_sessions rows over the record_snapshot
        # blob - same reasoning as Encapsulation's load-checks and Mixing's
        # sessions/ingredients/brands fixes. list() bulk-fetches and passes
        # these in to avoid an N+1 query per row; get() leaves it None to
        # fetch live for just the one record.
        live_sessions = session_rows if session_rows is not None else cls._time_log_rows(assembly_id)
        assembly_sessions = live_sessions or (
            snapshot.get("assemblySessions")
            or snapshot.get("assemblyTimeLogs")
            or snapshot.get("timeLogs")
            or []
        )

        bottle_type = row.get("bottle_type") or snapshot.get("bottleType") or ""
        bottle_size = str(row.get("bottle_size")) if row.get("bottle_size") is not None else ""
        snapshot.update(
            {
                "id": assembly_id,
                "assemblyCode": row.get("assembly_code") or "",
                "batchCode": row.get("batch_code") or snapshot.get("batchCode") or "",
                "brandBatchCodes": brand_batch_codes,
                "assemblySessions": assembly_sessions,
                "batchCodeDisplay": cls._batch_code_display(
                    brand_batch_codes,
                    row.get("assembly_code") or "",
                ),
                "encapsulationId": (
                    str(row["encapsulation_id"])
                    if row.get("encapsulation_id")
                    else ""
                ),
                "njpId": (
                    str(row["encapsulation_id"])
                    if row.get("encapsulation_id")
                    else ""
                ),
                "productId": str(row["product_id"]) if row.get("product_id") else (snapshot.get("productId") or ""),
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
                "totalUnitsUsed": int(db.as_decimal(row.get("capsules_received_qty"))),
                "capsulesReceivedKg": db.as_float(row.get("capsules_received_kg")),
                "capsulesPerBottle": int(row.get("capsules_per_bottle") or 0),
                "unitsPerBottle": int(row.get("capsules_per_bottle") or 0),
                "totalBottlesMade": int(row.get("total_bottles_made") or 0),
                "bottleQuantity": int(row.get("total_bottles_made") or 0),
                "availableBottleQuantity": available_bottle_quantity,
                "remainingBottleQuantity": available_bottle_quantity,
                "availableUnitsQty": available_bottle_quantity * int(row.get("capsules_per_bottle") or 0),
                "remainingUnitsQty": available_bottle_quantity * int(row.get("capsules_per_bottle") or 0),
                "totalLabelsUsed": int(row.get("total_labels_used") or 0),
                "filledBottleWeight": db.as_float(row.get("filled_bottle_weight"))
                if row.get("filled_bottle_weight") is not None
                else None,
                "weightUnit": row.get("weight_unit") or "g",
                "labelId": str(row.get("label_id")) if row.get("label_id") else (snapshot.get("labelId") or ""),
                "bottleLidId": (
                    str(row.get("bottle_lid_id"))
                    if row.get("bottle_lid_id")
                    else (snapshot.get("bottleLidId") or "")
                ),
                "looseCapsulesQty": int(db.as_decimal(row.get("remaining_capsules_qty"))),
                "remainingCapsulesQty": int(db.as_decimal(row.get("remaining_capsules_qty"))),
                "remainingCapsulesAfterBottlingQty": int(db.as_decimal(row.get("remaining_capsules_qty"))),
                "productionDate": row.get("production_date") or snapshot.get("productionDate"),
                "expiryDate": row.get("expiry_date") or snapshot.get("expiryDate"),
                "qualityControlDate": row.get("quality_control_date") or snapshot.get("qualityControlDate"),
                "qcDate": row.get("quality_control_date") or snapshot.get("qcDate"),
                "qualityControlStartTime": (
                    row.get("quality_control_start_time") or snapshot.get("qualityControlStartTime")
                ),
                "qcStartTime": row.get("quality_control_start_time") or snapshot.get("qcStartTime"),
                "qualityControlEndTime": (
                    row.get("quality_control_end_time") or snapshot.get("qualityControlEndTime")
                ),
                "qcEndTime": row.get("quality_control_end_time") or snapshot.get("qcEndTime"),
                "packagingDate": row.get("packaging_date") or snapshot.get("packagingDate"),
                "packageDate": row.get("packaging_date") or snapshot.get("packageDate"),
                "packagingStartTime": row.get("packaging_start_time") or snapshot.get("packagingStartTime"),
                "packagingEndTime": row.get("packaging_end_time") or snapshot.get("packagingEndTime"),
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
        item_ids = [str(row["id"]) for row in rows]
        brand_lots_by_assembly = cls._brand_lot_rows_bulk(item_ids)
        sessions_by_assembly = cls._time_log_rows_bulk(item_ids)
        records = [
            cls._db_to_app(
                row,
                brand_lots=brand_lots_by_assembly.get(str(row["id"]), []),
                session_rows=sessions_by_assembly.get(str(row["id"]), []),
            )
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
            records = [
                record
                for record in records
                if str(record.get("encapsulationId") or record.get("njpId")) == str(njp_id)
            ]
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

    @staticmethod
    def _rpc_scalar(response: Any) -> Any:
        result = response.data
        if isinstance(result, list) and result:
            result = result[0]
        if isinstance(result, dict):
            result = next(iter(result.values()), None)
        return result

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
                    .table("encapsulations")
                    .select("*")
                    .eq("id", njp_id)
                    .limit(1)
                )
            ),
            "Selected Encapsulation record was not found.",
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
            raise ServiceError("Selected Encapsulation has no available capsule inventory.", 400)
        available = db.get_inventory_quantity(inventory_item_id=str(item_id))
        previous_njp_id, previous_used_qty = cls._assembly_usage(previous or {})
        if previous_njp_id == njp_id:
            available += Decimal(previous_used_qty)
        if Decimal(used_qty) > available:
            raise ServiceError(
                f"Encapsulation capsules are not enough. Available: {int(available)}, required: {used_qty}.",
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
    def _resolved_payload_for_rpc(cls, cleaned: dict[str, Any]) -> dict[str, Any]:
        """Build the plan passed to the save_assembly() database function.

        All business-rule resolution (which Encapsulation/bottle-lid/label
        records to use, brand refs, numeric derivation, user-facing
        validation) already happened in _clean_payload(). This only shapes
        that result into the JSON contract save_assembly() expects - the
        function performs the entire write phase (code assignment, row
        insert/update, inventory consumption/production, child rows) as one
        atomic transaction. See supabase/migrations-2/014_....sql.
        """
        sessions = []
        for row in cleaned.get("assemblySessions") or []:
            session_date = db.date_from_ms(row.get("date") or row.get("sessionDate") or row.get("startDate"))
            if not session_date:
                continue
            sessions.append(
                {
                    "date": session_date,
                    "startTime": row.get("startTime") or None,
                    "endTime": row.get("endTime") or None,
                    "remarks": row.get("remarks") or row.get("dayRemarks"),
                }
            )

        return {
            "encapsulationId": cleaned.get("encapsulationId") or cleaned.get("njpId"),
            "batchCode": cleaned.get("batchCode"),
            "brands": [
                {
                    "id": brand.get("id") or brand.get("brandId"),
                    "name": brand.get("name") or brand.get("brandName"),
                    "codePrefix": brand.get("codePrefix") or brand.get("code_prefix"),
                }
                for brand in (cleaned.get("brands") or [])
                if brand.get("id") or brand.get("brandId")
            ],
            "productId": cleaned.get("productId") or None,
            "productName": cleaned.get("productName"),
            "location": cleaned.get("location"),
            "boxNo": cleaned.get("boxNo"),
            "bottleType": cleaned.get("bottleType") or "capsule",
            "bottleSize": cleaned.get("bottleSize") or None,
            "bottleCC": (
                db.decimal_str(cleaned.get("bottleCC")) if cleaned.get("bottleCC") is not None else None
            ),
            "capsuleWeightMg": db.decimal_str(cleaned.get("capsuleWeightMg")),
            "capsulesPerBottle": cleaned.get("capsulesPerBottle"),
            "bottleQuantity": cleaned.get("bottleQuantity"),
            "totalUnitsUsed": cleaned.get("totalUnitsUsed"),
            "capsulesReceivedKg": db.decimal_str(cleaned.get("capsulesReceivedKg")),
            "bottleLidId": cleaned.get("bottleLidId") or None,
            "labelId": cleaned.get("labelId") or None,
            "totalLabelsUsed": cleaned.get("totalLabelsUsed"),
            "filledBottleWeight": (
                db.decimal_str(cleaned.get("filledBottleWeight"))
                if cleaned.get("filledBottleWeight") is not None
                else None
            ),
            "weightUnit": cleaned.get("weightUnit") or "g",
            "productionDate": db.date_from_ms(cleaned.get("productionDate")),
            "expiryDate": db.date_from_ms(cleaned.get("expiryDate")),
            "status": cls._status_db(cleaned),
            "operatorName": cleaned.get("operatorName"),
            "comments": cleaned.get("comments"),
            "qualityControlDate": cleaned.get("qualityControlDate") or None,
            "qualityControlStartTime": cleaned.get("qualityControlStartTime") or None,
            "qualityControlEndTime": cleaned.get("qualityControlEndTime") or None,
            "packagingDate": cleaned.get("packagingDate") or None,
            "packagingStartTime": cleaned.get("packagingStartTime") or None,
            "packagingEndTime": cleaned.get("packagingEndTime") or None,
            "assemblySessions": sessions,
            "recordSnapshot": to_json_value(cleaned),
        }

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned = cls._clean_payload(payload)
        cls._validate_njp_inventory(cleaned)
        cls._validate_bottle_inventory(cleaned)
        cls._validate_label_inventory(cleaned)

        response = db.execute(
            db.client().rpc(
                "save_assembly",
                {"p_assembly_id": None, "p_payload": cls._resolved_payload_for_rpc(cleaned)},
            )
        )
        assembly_id = cls._rpc_scalar(response)
        if not assembly_id:
            raise ServiceError("Assembly was not saved", 500)
        return cls.get(str(assembly_id))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = db.require_row(cls._row_by_id(item_id), "Assembly record not found")
        previous = cls._db_to_app(row)
        cleaned = cls._clean_payload(payload, existing=previous)
        cls._validate_njp_inventory(cleaned, previous=previous)
        cls._validate_bottle_inventory(cleaned, previous=previous)
        cls._validate_label_inventory(cleaned, previous=previous)

        db.execute(
            db.client().rpc(
                "save_assembly",
                {"p_assembly_id": item_id, "p_payload": cls._resolved_payload_for_rpc(cleaned)},
            )
        )
        return cls.get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> dict[str, Any]:
        db.execute(db.client().rpc("delete_assembly", {"p_assembly_id": item_id}))
        return {"success": True}

__all__ = ["AssemblyService"]
