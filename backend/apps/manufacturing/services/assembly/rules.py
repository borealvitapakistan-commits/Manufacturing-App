from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from apps.inventory.services.bottles_lids import BOTTLE_TYPES, CAPSULE_TYPES, BottleLidService
from apps.inventory.services.labels import LabelService
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value


class AssemblyRules:
    REMOVED_TEXT_FIELDS = {"reason", "changeReason", "notes", "remarks"}

    STATUS_MAP = {
        "": "",
        "underprocess": "Underprocess",
        "in assembly": "Underprocess",
        "completed": "Completed",
        "assembly completed": "Completed",
    }

    @staticmethod
    def _now_ms() -> int:
        return int(datetime.now().timestamp() * 1000)

    @staticmethod
    def _as_text(value: Any) -> str:
        return str(value or "").strip()

    @staticmethod
    def _as_float_or_none(value: Any) -> float | None:
        if value in (None, ""):
            return None
        try:
            return round(float(value), 6)
        except (TypeError, ValueError):
            raise ServiceError("Invalid numeric value in Assembly record", 400)

    @classmethod
    def _as_int_or_none(cls, value: Any) -> int | None:
        number = cls._as_float_or_none(value)
        if number is None:
            return None
        return max(0, int(number))

    @classmethod
    def _pick(cls, payload: dict[str, Any], existing: dict[str, Any], key: str, default: Any = None) -> Any:
        return payload[key] if key in payload else existing.get(key, default)

    @classmethod
    def _first_float(cls, source: dict[str, Any], keys: tuple[str, ...]) -> float | None:
        for key in keys:
            value = cls._as_float_or_none(source.get(key))
            if value is not None:
                return value
        return None

    @classmethod
    def _first_int(cls, source: dict[str, Any], keys: tuple[str, ...]) -> int | None:
        for key in keys:
            value = cls._as_int_or_none(source.get(key))
            if value is not None:
                return value
        return None

    @classmethod
    def _record_total_capsules(cls, record: dict[str, Any]) -> int:
        return int(
            cls._first_int(
                record,
                (
                    "totalCapsulesFilledQty",
                    "netCapsulesFilledQty",
                    "capsuleAmount",
                    "grossCapsulesFilledQty",
                ),
            )
            or 0
        )

    @classmethod
    def _record_available_capsules(cls, record: dict[str, Any]) -> int:
        explicit = cls._first_int(
            record,
            (
                "availableCapsulesQty",
                "remainingCapsulesQty",
                "availableCapsuleQty",
                "availableCapsules",
            ),
        )
        if explicit is not None:
            return int(explicit)
        return cls._record_total_capsules(record)

    @classmethod
    def _capsule_weight_mg_from_njp(cls, record: dict[str, Any]) -> float:
        explicit = cls._first_float(record, ("capsuleWeightMg", "capsuleWeight"))
        if explicit and explicit > 0:
            return float(explicit)

        fill_mg = cls._as_float_or_none(record.get("targetFillWeightMg")) or 0
        empty_mg = cls._as_float_or_none(record.get("emptyCapsuleUnitWeightMg")) or 0
        if fill_mg > 0 or empty_mg > 0:
            return round(fill_mg + empty_mg, 6)

        produced_kg = cls._as_float_or_none(record.get("totalCapsulesProducedKg")) or 0
        capsule_count = cls._record_total_capsules(record)
        if produced_kg > 0 and capsule_count > 0:
            return round((produced_kg * 1_000_000) / capsule_count, 6)

        return 0

    @classmethod
    def _capsules_kg(cls, capsules_qty: Any, capsule_weight_mg: Any) -> float | None:
        qty = cls._as_float_or_none(capsules_qty)
        weight_mg = cls._as_float_or_none(capsule_weight_mg)
        if qty is None or weight_mg is None or qty <= 0 or weight_mg <= 0:
            return None
        return round((qty * weight_mg) / 1_000_000, 6)

    @classmethod
    def _brand_refs_from_njp(cls, njp: dict[str, Any]) -> list[dict[str, str]]:
        refs: list[dict[str, str]] = []

        def add_ref(brand_id: Any = "", brand_name: Any = "", code_prefix: Any = "") -> None:
            ref = {
                "id": cls._as_text(brand_id),
                "name": cls._as_text(brand_name),
                "codePrefix": cls._as_text(code_prefix),
            }
            if not ref["id"] and not ref["name"]:
                return
            ref_key = (ref["id"] or ref["name"].lower()).strip().lower()
            for existing_ref in refs:
                existing_key = (
                    existing_ref.get("id") or existing_ref.get("name", "").lower()
                ).strip().lower()
                if existing_key == ref_key:
                    if ref["codePrefix"] and not existing_ref.get("codePrefix"):
                        existing_ref["codePrefix"] = ref["codePrefix"]
                    return
            refs.append(ref)

        for item in njp.get("brands") or []:
            if isinstance(item, dict):
                add_ref(
                    item.get("id") or item.get("brandId"),
                    item.get("name") or item.get("brandName"),
                    item.get("codePrefix")
                    or item.get("code_prefix")
                    or item.get("prefix")
                    or item.get("code"),
                )

        ids = njp.get("brandIds") if isinstance(njp.get("brandIds"), list) else []
        names = njp.get("brandNames") if isinstance(njp.get("brandNames"), list) else []
        for index, brand_id in enumerate(ids):
            add_ref(brand_id, names[index] if index < len(names) else "")
        for index, brand_name in enumerate(names):
            add_ref(ids[index] if index < len(ids) else "", brand_name)

        add_ref(
            njp.get("brandId") or njp.get("brand_id"),
            njp.get("brandName") or njp.get("brand_name"),
            njp.get("brandCodePrefix")
            or njp.get("brand_code_prefix")
            or njp.get("codePrefix")
            or njp.get("code_prefix"),
        )
        return refs

    @classmethod
    def _brand_lookup(cls, brand_ref: dict[str, Any]) -> dict[str, Any]:
        return {}

    @classmethod
    def _brand_code_prefix_for_ref(cls, brand_ref: dict[str, Any]) -> str:
        prefix = cls._as_text(
            brand_ref.get("codePrefix")
            or brand_ref.get("code_prefix")
            or brand_ref.get("prefix")
            or brand_ref.get("code")
        )
        if not prefix:
            brand = cls._brand_lookup(brand_ref)
            prefix = cls._as_text(
                brand.get("codePrefix")
                or brand.get("code_prefix")
                or brand.get("prefix")
                or brand.get("code")
            )
        if not prefix:
            brand_name = cls._as_text(brand_ref.get("name") or brand_ref.get("brandName")) or "selected brand"
            raise ServiceError(
                f"Brand code prefix is required to generate Assembly code for {brand_name}. Add Code Prefix in Brands first.",
                400,
            )
        if not prefix.isdigit():
            raise ServiceError("Brand code prefix must be numeric to generate Assembly code.", 400)
        return prefix

    @classmethod
    def _brand_code_prefix(cls, njp: dict[str, Any]) -> str:
        refs = cls._brand_refs_from_njp(njp)
        if not refs:
            raise ServiceError(
                "Brand code prefix is required to generate Assembly code. Add Code Prefix in Brands first.",
                400,
            )
        return cls._brand_code_prefix_for_ref(refs[0])

    @staticmethod
    def _batch_code_display(brand_batch_codes: list[dict[str, Any]], fallback: str) -> str:
        if len(brand_batch_codes) <= 1:
            return fallback
        return "\n".join(
            f"{item.get('brandName') or item.get('brandId') or 'Brand'} Batch Code:\n{item.get('batchCode') or ''}"
            for item in brand_batch_codes
        )


    @classmethod
    def _public_record(cls, record: dict[str, Any]) -> dict[str, Any]:
        public = {
            key: value
            for key, value in record.items()
            if key not in cls.REMOVED_TEXT_FIELDS
        }
        public["comments"] = (
            record.get("comments")
            if record.get("comments") not in (None, "")
            else record.get("remarks")
        )
        return public

    @classmethod
    def _find_njp(cls, njp_id: str) -> dict[str, Any]:
        raise ServiceError(
            "Selected Encapsulation record was not found. Save Encapsulation first, then create Assembly from it.",
            404,
        )

    @classmethod
    def _find_njp_in_records(
        cls,
        records: list[dict[str, Any]],
        njp_id: str,
    ) -> dict[str, Any]:
        for record in records:
            if str(record.get("id")) == str(njp_id):
                return record
        raise ServiceError(
            "Selected Encapsulation record was not found. Save Encapsulation first, then create Assembly from it.",
            404,
        )

    @classmethod
    def _normalize_status(cls, value: Any) -> str:
        text = cls._as_text(value)
        if not text:
            return "Underprocess"
        return cls.STATUS_MAP.get(text.lower(), text)

    @classmethod
    def _normalize_sessions(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
    ) -> list[dict[str, Any]]:
        source = None
        for key in ("assemblySessions", "assemblyTimeLogs", "timeLogs"):
            if key in payload:
                source = payload.get(key)
                break

        if source is None:
            if not any(key in payload for key in ("productionDate", "startDate", "startTime", "endDate", "endTime")):
                return existing.get("assemblySessions", []) or []

            date = payload.get("productionDate") or payload.get("startDate")
            source = [
                {
                    "date": date,
                    "startDate": payload.get("startDate") or date,
                    "startTime": payload.get("startTime"),
                    "endDate": payload.get("endDate") or date,
                    "endTime": payload.get("endTime"),
                    "remarks": payload.get("remarks"),
                }
            ]

        sessions = []
        for item in source or []:
            date = item.get("date") or item.get("productionDate") or item.get("startDate")
            start_date = item.get("startDate") or date
            end_date = item.get("endDate") or date or start_date
            start_time = cls._as_text(item.get("startTime"))
            end_time = cls._as_text(item.get("endTime"))
            remarks = cls._as_text(item.get("remarks"))

            if not any([date, start_date, end_date, start_time, end_time, remarks]):
                continue

            sessions.append(
                to_json_value(
                    {
                        "date": date or start_date,
                        "startDate": start_date,
                        "startTime": start_time,
                        "endDate": end_date,
                        "endTime": end_time,
                        "remarks": remarks,
                    }
                )
            )

        return sessions

    @staticmethod
    def _first_session_value(sessions: list[dict[str, Any]], key: str, default: Any = None) -> Any:
        if not sessions:
            return default
        return sessions[0].get(key, default)

    @staticmethod
    def _last_session_value(sessions: list[dict[str, Any]], key: str, default: Any = None) -> Any:
        if not sessions:
            return default
        return sessions[-1].get(key, default)

    @classmethod
    def _assembly_usage(cls, record: dict[str, Any]) -> tuple[str, int]:
        njp_id = cls._as_text(record.get("encapsulationId") or record.get("njpId"))
        used_qty = cls._as_int_or_none(record.get("capsulesReceivedQty")) or 0
        return njp_id, int(used_qty)

    @classmethod
    def _bottle_lid_usage(cls, record: dict[str, Any]) -> tuple[str, int]:
        bottle_lid_id = cls._as_text(record.get("bottleLidId"))
        used_qty = cls._as_int_or_none(record.get("totalBottlesMade")) or 0
        return bottle_lid_id, int(used_qty)

    @classmethod
    def _label_usage(cls, record: dict[str, Any]) -> tuple[str, int]:
        label_id = cls._as_text(record.get("labelId"))
        # Labels used always equals bottles made - one label per bottle.
        used_qty = cls._as_int_or_none(record.get("totalLabelsUsed")) or 0
        return label_id, int(used_qty)

    @classmethod
    def _bottle_lid_type(cls, record: dict[str, Any]) -> str:
        return cls._as_text(record.get("bottleType") or record.get("bottle_type")).lower()

    @classmethod
    def _selected_bottle_type(cls, payload: dict[str, Any], existing: dict[str, Any]) -> str:
        return cls._as_text(
            cls._pick(payload, existing, "bottleType", cls._pick(payload, existing, "bottle_type", ""))
        ).lower()

    @classmethod
    def _normalize_bottle_size(cls, value: Any) -> str:
        text = cls._as_text(value)
        if not text:
            return ""
        try:
            number = float(text)
        except (TypeError, ValueError):
            return text
        return str(int(number)) if number.is_integer() else text

    @classmethod
    def _bottle_lid_capsule_type(cls, record: dict[str, Any]) -> str:
        return cls._normalize_bottle_size(record.get("capsuleType") or record.get("capsule_type"))

    @classmethod
    def _selected_bottle_size(cls, payload: dict[str, Any], existing: dict[str, Any]) -> str:
        return cls._normalize_bottle_size(
            cls._pick(
                payload,
                existing,
                "bottleCapsuleType",
                cls._pick(
                    payload,
                    existing,
                    "bottleSize",
                    cls._pick(payload, existing, "bottleCC"),
                ),
            )
        )

    @classmethod
    def _bottle_lid_quantity(cls, record: dict[str, Any]) -> int:
        return cls._as_int_or_none(record.get("quantity")) or 0

    @staticmethod
    def _set_bottle_lid_quantity(record: dict[str, Any], quantity: int) -> None:
        record["quantity"] = int(max(0, quantity))

    @classmethod
    def _bottle_inventory_label(cls, bottle_type: str, bottle_size: str = "") -> str:
        if bottle_type == "capsule":
            return f"Capsule {bottle_size}" if bottle_size else "Capsule"
        if bottle_type == "jar":
            return "Jar"
        return "Bottle"

    @classmethod
    def _bottle_lid_records_for_choice(
        cls,
        records: list[dict[str, Any]],
        *,
        bottle_type: str,
        bottle_size: str = "",
    ) -> list[dict[str, Any]]:
        matches = [
            record for record in records
            if cls._bottle_lid_type(record) == bottle_type
        ]
        if bottle_type == "capsule":
            matches = [
                record for record in matches
                if cls._bottle_lid_capsule_type(record) == bottle_size
            ]
        return matches

    @classmethod
    def _validate_bottle_lid_choice(
        cls,
        bottle_lid: dict[str, Any],
        *,
        selected_bottle_type: str,
        selected_bottle_size: str = "",
    ) -> tuple[str, str]:
        inventory_bottle_type = cls._bottle_lid_type(bottle_lid)
        if inventory_bottle_type not in BOTTLE_TYPES:
            raise ServiceError("Bottle type must be Capsule or Jar.", 400)
        if selected_bottle_type and inventory_bottle_type != selected_bottle_type:
            raise ServiceError(
                f"Selected inventory is {cls._bottle_inventory_label(inventory_bottle_type, cls._bottle_lid_capsule_type(bottle_lid))}, but Assembly is using {cls._bottle_inventory_label(selected_bottle_type, selected_bottle_size)}.",
                400,
            )

        if inventory_bottle_type == "jar":
            return inventory_bottle_type, ""

        inventory_bottle_size = cls._bottle_lid_capsule_type(bottle_lid)
        bottle_size = selected_bottle_size or inventory_bottle_size
        if bottle_size not in CAPSULE_TYPES:
            raise ServiceError("Select Bottle Type before saving Assembly. Capsule bottles must be 200, 250, or 300.", 400)
        if inventory_bottle_size != bottle_size:
            raise ServiceError(
                f"Selected Bottle/Lid inventory size does not match Assembly Bottle Type. Select Capsule {bottle_size} inventory.",
                400,
            )
        return inventory_bottle_type, bottle_size

    @classmethod
    def _resolve_bottle_lid(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
        total_bottles_made: int | None,
    ) -> dict[str, Any] | None:
        raise ServiceError("Assembly bottle inventory must be resolved from Supabase.", 500)

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
        raise ServiceError("Assembly label inventory must be resolved from Supabase.", 500)

    @classmethod
    def _clean_payload(
        cls,
        payload: dict[str, Any],
        *,
        existing: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        existing = existing or {}

        njp_id = cls._as_text(
            payload.get("encapsulationId") or payload.get("njpId")
            if ("encapsulationId" in payload or "njpId" in payload)
            else (existing.get("encapsulationId") or existing.get("njpId"))
        )
        if not njp_id:
            raise ServiceError("Select the Encapsulation capsule record that will be used for Assembly.", 400)

        njp = cls._find_njp(njp_id)
        requested_brand_id = cls._as_text(cls._pick(payload, existing, "brandId", ""))
        requested_product_id = cls._as_text(cls._pick(payload, existing, "productId", ""))
        njp_brand_id = cls._as_text(njp.get("brandId") or njp.get("brand_id"))
        njp_product_id = cls._as_text(njp.get("productId") or njp.get("product_id"))
        brand_refs = cls._brand_refs_from_njp(njp)
        primary_brand = brand_refs[0] if brand_refs else {"id": "", "name": "", "codePrefix": ""}
        brand_ids = [brand["id"] for brand in brand_refs if brand.get("id")]
        brand_names = [brand["name"] for brand in brand_refs if brand.get("name")]

        if requested_brand_id and brand_ids and requested_brand_id not in brand_ids:
            raise ServiceError("Selected Encapsulation does not belong to the selected brand.", 400)
        if requested_brand_id and not brand_ids and njp_brand_id and requested_brand_id != njp_brand_id:
            raise ServiceError("Selected Encapsulation does not belong to the selected brand.", 400)
        if requested_product_id and njp_product_id and requested_product_id != njp_product_id:
            raise ServiceError("Selected Encapsulation does not belong to the selected product.", 400)

        # Assembly Code itself is generated transaction-safely by the
        # save_assembly()/next_brand_batch_code() database functions (see
        # supabase/migrations-2/014_...). This is only a friendly, early
        # validation pass so a missing brand code prefix is reported before
        # any database write is attempted.
        if not brand_refs:
            raise ServiceError(
                "Brand code prefix is required to generate Assembly code. Add Code Prefix in Brands first.",
                400,
            )
        for brand_ref in brand_refs:
            cls._brand_code_prefix_for_ref(brand_ref)

        # Assembly Code / Batch Code are read-only after creation - once an
        # Assembly exists, always keep whatever the database already
        # assigned rather than anything the client might send.
        assembly_code = existing.get("assemblyCode") or ""
        brand_batch_codes = existing.get("brandBatchCodes") or []

        # Batch Code is not user-entered - it comes from the source
        # Encapsulation record's lot number (falling back to its mixing
        # code), captured at save time.
        batch_code = cls._as_text(njp.get("lotNumber") or njp.get("mixingCode") or "")

        source_capsule_weight_mg = cls._capsule_weight_mg_from_njp(njp)
        capsule_weight_mg = cls._as_float_or_none(
            cls._pick(payload, existing, "capsuleWeightMg", source_capsule_weight_mg)
        )
        if capsule_weight_mg is None:
            capsule_weight_mg = source_capsule_weight_mg

        capsules_per_bottle = cls._as_int_or_none(
            cls._pick(
                payload,
                existing,
                "capsulesPerBottle",
                cls._pick(payload, existing, "unitsPerBottle"),
            )
        )
        if not capsules_per_bottle or capsules_per_bottle <= 0:
            raise ServiceError("Enter Capsules per Bottle before saving Assembly.", 400)

        # Bottle Quantity is the primary user input; Total Units Used is
        # always derived from it, never entered directly.
        bottle_quantity = cls._as_int_or_none(
            cls._pick(
                payload,
                existing,
                "bottleQuantity",
                cls._pick(payload, existing, "totalBottlesMade"),
            )
        )
        if not bottle_quantity or bottle_quantity <= 0:
            raise ServiceError("Enter Bottle Quantity before saving Assembly.", 400)

        total_bottles_made = bottle_quantity
        total_units_used = bottle_quantity * capsules_per_bottle
        capsules_received_qty = total_units_used
        loose_capsules_qty = 0

        capsules_received_kg = cls._as_float_or_none(
            cls._pick(payload, existing, "capsulesReceivedKg")
        )
        calculated_capsules_received_kg = cls._capsules_kg(capsules_received_qty, capsule_weight_mg)
        if capsules_received_kg is None:
            capsules_received_kg = calculated_capsules_received_kg

        weight_unit = cls._as_text(cls._pick(payload, existing, "weightUnit", "g")) or "g"
        if weight_unit not in {"g", "mg"}:
            raise ServiceError("Weight unit must be g or mg.", 400)

        filled_bottle_weight = cls._as_float_or_none(cls._pick(payload, existing, "filledBottleWeight"))
        if filled_bottle_weight is not None and filled_bottle_weight <= 0:
            raise ServiceError("Filled Bottle Weight must be greater than zero.", 400)

        bottle_lid = cls._resolve_bottle_lid(payload, existing, total_bottles_made)

        # Labels used always equals Total Bottles Made (one label per bottle).
        total_labels_used = int(total_bottles_made or 0)
        label = cls._resolve_label(
            payload,
            existing,
            total_labels_used,
            brand_id=primary_brand.get("id") or "",
            product_id=njp.get("productId") or "",
        )
        label_id = cls._as_text(label.get("id")) if label else cls._as_text(
            cls._pick(payload, existing, "labelId", "")
        )

        if label:
            dosage = cls._as_int_or_none(label.get("dosageType"))
            if dosage and capsules_per_bottle > dosage:
                raise ServiceError(
                    f"Capsules per bottle cannot exceed the selected label dosage count of {dosage}.",
                    400,
                )
        bottle_lid_id = cls._as_text(bottle_lid.get("id")) if bottle_lid else ""
        selected_bottle_size = cls._selected_bottle_size(payload, existing)
        selected_bottle_type = cls._selected_bottle_type(payload, existing)
        if bottle_lid:
            bottle_type = cls._bottle_lid_type(bottle_lid)
        elif selected_bottle_type:
            bottle_type = selected_bottle_type
        elif selected_bottle_size:
            bottle_type = "capsule"
        else:
            bottle_type = ""
        bottle_capsule_type = (
            cls._bottle_lid_capsule_type(bottle_lid)
            if bottle_lid and bottle_type == "capsule"
            else (selected_bottle_size if bottle_type == "capsule" else "")
        )
        bottle_cc = cls._as_float_or_none(bottle_capsule_type) if bottle_capsule_type else None

        sessions = cls._normalize_sessions(payload, existing)
        production_date = cls._pick(
            payload,
            existing,
            "productionDate",
            cls._first_session_value(sessions, "date"),
        )
        start_date = cls._pick(
            payload,
            existing,
            "startDate",
            cls._first_session_value(sessions, "startDate"),
        )
        start_time = cls._pick(
            payload,
            existing,
            "startTime",
            cls._first_session_value(sessions, "startTime"),
        )
        end_date = cls._pick(
            payload,
            existing,
            "endDate",
            cls._last_session_value(sessions, "endDate"),
        )
        end_time = cls._pick(
            payload,
            existing,
            "endTime",
            cls._last_session_value(sessions, "endTime"),
        )

        location = cls._as_text(cls._pick(payload, existing, "location", ""))
        box_no = cls._as_text(
            cls._pick(
                payload,
                existing,
                "boxNo",
                payload.get("bucket") if "bucket" in payload else existing.get("bucket", ""),
            )
        )
        status = cls._normalize_status(cls._pick(payload, existing, "status"))

        final_quantities = cls._pick(payload, existing, "finalQuantities", {}) or {}
        if not isinstance(final_quantities, dict):
            final_quantities = {}

        capsule_data = cls._pick(payload, existing, "capsuleData", {}) or {}
        if not isinstance(capsule_data, dict):
            capsule_data = {}

        batch_code_display = cls._batch_code_display(brand_batch_codes, assembly_code)

        cleaned = {
            "assemblyCode": assembly_code,
            "batchCode": batch_code,
            "batchCodeDisplay": batch_code_display,
            "brandBatchCodes": brand_batch_codes,
            "encapsulationId": njp_id,
            "encapsulationCode": njp.get("encapsulationCode") or njp.get("njpCode") or "",
            "njpId": njp_id,
            "njpCode": njp.get("njpCode") or "",
            "mixingId": njp.get("mixingId") or "",
            "mixingCode": njp.get("mixingCode") or "",
            "mixingName": njp.get("mixingName") or "",
            "brandId": primary_brand.get("id") or "",
            "brandName": primary_brand.get("name") or "",
            "brandIds": brand_ids,
            "brandNames": brand_names,
            "brands": brand_refs,
            "isMultiBrand": len(brand_refs) > 1,
            "productId": njp.get("productId") or "",
            "productName": njp.get("productName") or "",
            "location": location,
            "rackNo": location,
            "boxNo": box_no,
            "bucket": box_no,
            "sourceLocation": njp.get("location") or njp.get("rackNo") or "",
            "sourceBucket": njp.get("bucket") or "",
            "capsuleWeight": capsule_weight_mg,
            "capsuleWeightMg": capsule_weight_mg,
            "sourceCapsuleWeightMg": source_capsule_weight_mg,
            "capsuleWeightModified": (
                source_capsule_weight_mg > 0
                and capsule_weight_mg is not None
                and abs(float(capsule_weight_mg) - source_capsule_weight_mg) > 0.0001
            ),
            "filledBottleWeight": filled_bottle_weight,
            "weightUnit": weight_unit,
            "capsulesReceivedQty": int(capsules_received_qty),
            "totalUnitsUsed": int(total_units_used),
            "capsulesReceivedKg": capsules_received_kg,
            "calculatedCapsulesReceivedKg": calculated_capsules_received_kg,
            "capsulesPerBottle": capsules_per_bottle,
            "unitsPerBottle": capsules_per_bottle,
            "totalBottlesMade": total_bottles_made,
            "bottleQuantity": bottle_quantity,
            "looseCapsulesQty": loose_capsules_qty,
            "remainingCapsulesAfterBottlingQty": loose_capsules_qty,
            "bottleLidId": bottle_lid_id,
            "bottleType": bottle_type,
            "bottleCapsuleType": bottle_capsule_type,
            "bottleSize": bottle_capsule_type,
            "bottleCC": bottle_cc,
            "labelId": label_id,
            "totalLabelsUsed": total_labels_used,
            "receivedCapsuleBucketNumber": cls._as_text(
                cls._pick(payload, existing, "receivedCapsuleBucketNumber", "")
            ),
            "receivedCapsulesProductionDate": cls._pick(
                payload,
                existing,
                "receivedCapsulesProductionDate",
            ),
            "productionDate": production_date,
            "expiryDate": cls._pick(payload, existing, "expiryDate"),
            "startDate": start_date,
            "startTime": start_time,
            "endDate": end_date,
            "endTime": end_time,
            "assemblySessions": sessions,
            "assemblyTimeLogs": sessions,
            "timeLogs": sessions,
            "qualityControlDate": cls._pick(payload, existing, "qualityControlDate", cls._pick(payload, existing, "qcDate")),
            "qcDate": cls._pick(payload, existing, "qcDate", cls._pick(payload, existing, "qualityControlDate")),
            "qualityControlStartTime": cls._pick(
                payload,
                existing,
                "qualityControlStartTime",
                cls._pick(payload, existing, "qcStartTime"),
            ),
            "qualityControlEndTime": cls._pick(
                payload,
                existing,
                "qualityControlEndTime",
                cls._pick(payload, existing, "qcEndTime"),
            ),
            "qcStartTime": cls._pick(payload, existing, "qcStartTime", cls._pick(payload, existing, "qualityControlStartTime")),
            "qcEndTime": cls._pick(payload, existing, "qcEndTime", cls._pick(payload, existing, "qualityControlEndTime")),
            "packagingDate": cls._pick(payload, existing, "packagingDate", cls._pick(payload, existing, "packageDate")),
            "packageDate": cls._pick(payload, existing, "packageDate", cls._pick(payload, existing, "packagingDate")),
            "packagingStartTime": cls._pick(payload, existing, "packagingStartTime"),
            "packagingEndTime": cls._pick(payload, existing, "packagingEndTime"),
            "status": status,
            "comments": cls._pick(
                payload,
                existing,
                "comments",
                cls._pick(payload, existing, "remarks"),
            ),
            "operatorName": cls._pick(payload, existing, "operatorName"),
            "finalQuantities": {
                **final_quantities,
                "capsulesReceivedQty": int(capsules_received_qty),
                "totalUnitsUsed": int(total_units_used),
                "capsulesReceivedKg": capsules_received_kg,
                "capsulesPerBottle": capsules_per_bottle,
                "totalBottlesMade": total_bottles_made,
                "bottleQuantity": bottle_quantity,
                "looseCapsulesQty": loose_capsules_qty,
                "remainingCapsulesAfterBottlingQty": loose_capsules_qty,
                "bottleLidId": bottle_lid_id,
                "bottleType": bottle_type,
                "bottleCapsuleType": bottle_capsule_type,
                "bottleSize": bottle_capsule_type,
                "labelId": label_id,
                "totalLabelsUsed": total_labels_used,
            },
            "capsuleData": {
                **capsule_data,
                "encapsulationId": njp_id,
                "encapsulationCode": njp.get("encapsulationCode") or njp.get("njpCode") or "",
                "njpId": njp_id,
                "njpCode": njp.get("njpCode") or "",
                "mixingCode": njp.get("mixingCode") or "",
                "brandId": primary_brand.get("id") or "",
                "brandName": primary_brand.get("name") or "",
                "brandIds": brand_ids,
                "brandNames": brand_names,
                "brands": brand_refs,
                "brandBatchCodes": brand_batch_codes,
                "batchCodeDisplay": batch_code_display,
                "productName": njp.get("productName") or "",
                "capsuleWeightMg": capsule_weight_mg,
                "capsulesReceivedQty": int(capsules_received_qty),
                "capsulesReceivedKg": capsules_received_kg,
            },
        }

        return to_json_value(cleaned)

__all__ = ["AssemblyRules"]
