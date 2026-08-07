from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.manufacturing.services.mixing import MixingService
from services import db
from services.base_service import ServiceError
from services.converters import to_json_value


class EncapsulationRules:
    EMPTY_CAPSULE_UNIT_WEIGHT_MG = 123
    STATUS_MAP = {
        "": "",
        "underprocess": "Underprocess",
        "in njp": "Underprocess",
        "in encapsulation": "Underprocess",
        "completed": "Completed",
        "njp completed": "Completed",
        "encapsulation completed": "Completed",
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
            raise ServiceError("Invalid numeric value in Encapsulation record", 400)

    @classmethod
    def _as_int_or_none(cls, value: Any) -> int | None:
        number = cls._as_float_or_none(value)
        if number is None:
            return None
        return max(0, int(number))

    @classmethod
    def _first_float(cls, source: dict[str, Any], keys: tuple[str, ...]) -> float | None:
        for key in keys:
            value = cls._as_float_or_none(source.get(key))
            if value is not None:
                return value
        return None

    @classmethod
    def _record_total_kg(cls, record: dict[str, Any]) -> float:
        return float(
            cls._first_float(
                record,
                (
                    "totalKgInMixing",
                    "totalKg",
                    "totalMixingKg",
                    "totalMixedQtyKg",
                    "totalFormulaQtyKg",
                ),
            )
            or 0
        )

    @classmethod
    def _record_available_kg(cls, record: dict[str, Any]) -> float:
        explicit = cls._first_float(
            record,
            (
                "availableMixedPowderKg",
                "remainingMixedPowderKg",
                "availablePowderKg",
            ),
        )
        if explicit is not None:
            return float(explicit)
        return cls._record_total_kg(record)

    @classmethod
    def _row_dose_mg(cls, row: dict[str, Any]) -> float:
        return float(
            cls._first_float(
                row,
                (
                    "mgDoseUsed",
                    "doseMg",
                    "mgDose",
                    "dosageMg",
                    "nmiDosageMg",
                    "labelClaimMgPerUnit",
                    "labelClaimMg",
                ),
            )
            or 0
        )

    @classmethod
    def _target_fill_weight_from_mixing(cls, mixing: dict[str, Any]) -> float:
        medicinal_rows = (
            mixing.get("medicinalIngredients")
            if mixing.get("medicinalIngredients")
            else mixing.get("rmUsage") or []
        )
        non_medicinal_rows = (
            mixing.get("nonMedicinalIngredients")
            if mixing.get("nonMedicinalIngredients")
            else mixing.get("nonMedUsage") or []
        )
        return round(
            sum(cls._row_dose_mg(row) for row in [*medicinal_rows, *non_medicinal_rows]),
            6,
        )

    @classmethod
    def _capsules_from_mix_kg(cls, mix_kg: Any, target_fill_weight_mg: Any) -> int | None:
        target_mg = cls._as_float_or_none(target_fill_weight_mg)
        total_kg = cls._as_float_or_none(mix_kg)
        if target_mg is None or total_kg is None or target_mg <= 0 or total_kg <= 0:
            return None
        return int(total_kg / (target_mg / 1_000_000))

    @classmethod
    def _empty_capsule_weight_kg(
        cls,
        capsules_count: Any,
        unit_weight_mg: Any = None,
    ) -> float | None:
        count = cls._as_float_or_none(capsules_count)
        unit_mg = cls._as_float_or_none(unit_weight_mg)
        if unit_mg is None:
            unit_mg = cls.EMPTY_CAPSULE_UNIT_WEIGHT_MG
        if count is None or count <= 0:
            return None
        return round((count * unit_mg) / 1_000_000, 6)

    @classmethod
    def _total_capsules_produced_kg(
        cls,
        capsules_count: Any,
        target_fill_weight_mg: Any,
        unit_weight_mg: Any = None,
    ) -> float | None:
        count = cls._as_float_or_none(capsules_count)
        target_mg = cls._as_float_or_none(target_fill_weight_mg)
        unit_mg = cls._as_float_or_none(unit_weight_mg)
        if unit_mg is None:
            unit_mg = cls.EMPTY_CAPSULE_UNIT_WEIGHT_MG
        if count is None or target_mg is None or count <= 0 or target_mg <= 0:
            return None
        return round((count * (target_mg + unit_mg)) / 1_000_000, 6)

    @classmethod
    def _rejected_capsules_weight_kg(
        cls,
        rejected_count: Any,
        target_fill_weight_mg: Any,
        unit_weight_mg: Any = None,
    ) -> float | None:
        return cls._total_capsules_produced_kg(
            rejected_count,
            target_fill_weight_mg,
            unit_weight_mg,
        )

    @staticmethod
    def _code_word(value: Any) -> str:
        return "".join(ch for ch in str(value or "").upper() if ch.isalnum())

    @classmethod
    def _product_display_name(cls, product: dict[str, Any] | None) -> str:
        product = product or {}
        return cls._as_text(
            product.get("name")
            or product.get("productName")
            or product.get("product_name")
            or product.get("productCode")
            or product.get("product_code")
            or product.get("code")
            or product.get("npn")
            or "PRO"
        )

    @classmethod
    def _product_code_products(cls) -> list[dict[str, Any]]:
        return []

    @classmethod
    def _product_code_prefix(
        cls,
        product: dict[str, Any] | None,
        products: list[dict[str, Any]] | None = None,
    ) -> str:
        product = product or {}
        products = products or []
        product_id = cls._as_text(product.get("id"))
        words = [cls._code_word(word) for word in cls._product_display_name(product).split()]
        words = [word for word in words if word]
        first_word = words[0] if words else "PRO"
        base_prefix = (first_word[:3] + "XXX")[:3]

        has_first_word_collision = False
        for other in products:
            other_id = cls._as_text(other.get("id"))
            if product_id and other_id == product_id:
                continue
            other_words = [cls._code_word(word) for word in cls._product_display_name(other).split()]
            other_words = [word for word in other_words if word]
            other_first_word = other_words[0] if other_words else ""
            if (other_first_word[:3] + "XXX")[:3] == base_prefix:
                has_first_word_collision = True
                break

        if has_first_word_collision:
            suffix_letter = words[1][:1] if len(words) > 1 else first_word[2:3]
            return (first_word[:2] + (suffix_letter or "X") + "XXX")[:3]

        return base_prefix

    @staticmethod
    def _encapsulation_code_number(value: Any) -> int | None:
        text = str(value or "").strip().upper()
        if not text:
            return None
        if text.startswith("NJP-") or text.startswith("E-"):
            suffix = text.rsplit("-", 1)[-1]
        else:
            return None
        return int(suffix) if suffix.isdigit() else None

    @classmethod
    def _next_code(
        cls,
        records: list[dict[str, Any]],
        *,
        product: dict[str, Any] | None = None,
        products: list[dict[str, Any]] | None = None,
    ) -> str:
        highest = 0
        for record in records:
            for key in ("encapsulationCode", "njpCode"):
                number = cls._encapsulation_code_number(record.get(key))
                if number is not None:
                    highest = max(highest, number)

        return f"E-{cls._product_code_prefix(product, products or cls._product_code_products())}-{highest + 1:03d}"

    @staticmethod
    def _ensure_unique_code(
        records: list[dict[str, Any]],
        encapsulation_code: str,
        *,
        current_id: str | None = None,
    ) -> None:
        normalized = encapsulation_code.strip().lower()
        if not normalized:
            return
        for record in records:
            if current_id and str(record.get("id")) == current_id:
                continue
            existing_codes = (
                record.get("encapsulationCode"),
                record.get("njpCode"),
            )
            if any(str(code or "").strip().lower() == normalized for code in existing_codes):
                raise ServiceError("Encapsulation code already exists", 409)

    @classmethod
    def _find_mixing(cls, mixing_id: str) -> dict[str, Any]:
        raise ServiceError(
            "Selected mixing was not found. Save the mixing first, then create Encapsulation from it.",
            404,
        )

    @staticmethod
    def _mixing_name(mixing: dict[str, Any]) -> str:
        return (
            str(
                mixing.get("productName")
                or mixing.get("mixedPowderName")
                or mixing.get("mixingCode")
                or "Mixing"
            )
            .strip()
        )

    @classmethod
    def _mixing_location(cls, mixing: dict[str, Any]) -> str:
        return cls._as_text(mixing.get("location") or mixing.get("rackNo"))

    @classmethod
    def _brand_refs_from_mixing(cls, mixing: dict[str, Any]) -> list[dict[str, str]]:
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

        for item in mixing.get("brands") or []:
            if isinstance(item, dict):
                add_ref(
                    item.get("id") or item.get("brandId"),
                    item.get("name") or item.get("brandName"),
                    item.get("codePrefix")
                    or item.get("code_prefix")
                    or item.get("prefix")
                    or item.get("code"),
                )

        ids = mixing.get("brandIds") if isinstance(mixing.get("brandIds"), list) else []
        names = mixing.get("brandNames") if isinstance(mixing.get("brandNames"), list) else []
        for index, brand_id in enumerate(ids):
            add_ref(brand_id, names[index] if index < len(names) else "")
        for index, brand_name in enumerate(names):
            add_ref(ids[index] if index < len(ids) else "", brand_name)

        add_ref(mixing.get("brandId"), mixing.get("brandName"), mixing.get("brandCodePrefix"))
        return refs

    @staticmethod
    def _record_has_brand(record: dict[str, Any], brand_id: str) -> bool:
        brand_id_text = str(brand_id)
        if str(record.get("brandId")) == brand_id_text:
            return True
        return any(str(item) == brand_id_text for item in record.get("brandIds") or [])

    @classmethod
    def _normalize_status(cls, value: Any, *, completed_by_time: bool = False) -> str:
        text = cls._as_text(value)
        if not text:
            return "Underprocess"
        return cls.STATUS_MAP.get(text.lower(), text)

    @classmethod
    def _normalize_load_checks(cls, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for original in rows or []:
            row = dict(original or {})
            weights = []
            for key in ("w1Mg", "w2Mg", "w3Mg", "w4Mg", "w5Mg"):
                value = cls._as_float_or_none(row.get(key))
                if value is not None:
                    weights.append(value)

            avg_mg = cls._as_float_or_none(
                row.get("avgMg")
                or row.get("avgWeightMg")
                or row.get("averageWeightMg")
            )
            if avg_mg is None and weights:
                avg_mg = round(sum(weights) / len(weights), 2)

            normalized_row = {
                **row,
                "checkDate": row.get("checkDate") or row.get("date"),
                "date": row.get("date") or row.get("checkDate"),
                "checkTime": row.get("checkTime") or row.get("time"),
                "time": row.get("time") or row.get("checkTime"),
                "loadLabel": row.get("loadLabel") or row.get("load"),
                "load": row.get("load") or row.get("loadLabel"),
                "w1Mg": cls._as_float_or_none(row.get("w1Mg")),
                "w2Mg": cls._as_float_or_none(row.get("w2Mg")),
                "w3Mg": cls._as_float_or_none(row.get("w3Mg")),
                "w4Mg": cls._as_float_or_none(row.get("w4Mg")),
                "w5Mg": cls._as_float_or_none(row.get("w5Mg")),
                "avgMg": avg_mg,
                "avgWeightMg": avg_mg,
                "averageWeightMg": avg_mg,
                "sampleCount": cls._as_int_or_none(row.get("sampleCount")) or (len(weights) if weights else None),
                "operatorName": cls._as_text(row.get("operatorName")),
                "remarks": cls._as_text(row.get("remarks")),
            }
            if any(
                normalized_row.get(key) not in {None, ""}
                for key in (
                    "checkDate",
                    "checkTime",
                    "loadLabel",
                    "w1Mg",
                    "w2Mg",
                    "w3Mg",
                    "w4Mg",
                    "w5Mg",
                )
            ):
                normalized.append(to_json_value(normalized_row))

        return normalized

    @classmethod
    def _normalize_sessions(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
    ) -> list[dict[str, Any]]:
        source = None
        for key in (
            "encapsulationSessions",
            "encapsulationTimeLogs",
            "njpSessions",
            "njpTimeLogs",
            "timeLogs",
        ):
            if key in payload:
                source = payload.get(key)
                break

        if source is None:
            if not any(key in payload for key in ("productionDate", "startDate", "startTime", "endDate", "endTime")):
                return (
                    existing.get("encapsulationSessions")
                    or existing.get("njpSessions")
                    or []
                )

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
    def _pick(cls, payload: dict[str, Any], existing: dict[str, Any], key: str, default: Any = None) -> Any:
        return payload[key] if key in payload else existing.get(key, default)

    @classmethod
    def _encapsulation_usage(cls, record: dict[str, Any]) -> tuple[str, float]:
        mixing_id = cls._as_text(record.get("mixingId"))
        used_kg = (
            cls._as_float_or_none(record.get("availableMixingUsedKg"))
            or cls._as_float_or_none(record.get("mixingUsedInEncapsulationKg"))
            or cls._as_float_or_none(record.get("rawMaterialReceivedKg"))
            or cls._as_float_or_none(record.get("mixingUsedInNJPkg"))
            or 0
        )
        return mixing_id, float(used_kg)

    _njp_usage = _encapsulation_usage

    @classmethod
    def _clean_payload(
        cls,
        payload: dict[str, Any],
        *,
        existing: dict[str, Any] | None = None,
        records: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        existing = existing or {}
        records = records or []

        mixing_id = cls._as_text(
            payload.get("mixingId")
            if "mixingId" in payload
            else existing.get("mixingId")
        )
        if not mixing_id:
            raise ServiceError("Select the mixing that will be used for Encapsulation.", 400)

        mixing = cls._find_mixing(mixing_id)
        mixing_code = cls._as_text(mixing.get("mixingCode"))
        mixing_name = cls._mixing_name(mixing)
        product = {
            "id": mixing.get("productId") or mixing.get("product_id"),
            "name": mixing.get("productName") or mixing.get("product_name") or mixing_name,
            "productName": mixing.get("productName") or mixing.get("product_name") or mixing_name,
            "product_name": mixing.get("product_name") or mixing.get("productName") or mixing_name,
            "productCode": mixing.get("productCode") or mixing.get("product_code") or mixing.get("npn"),
            "product_code": mixing.get("product_code") or mixing.get("productCode"),
            "code": mixing.get("productCode") or mixing.get("product_code") or mixing.get("npn"),
            "npn": mixing.get("npn"),
        }
        encapsulation_code = (
            cls._as_text(cls._pick(payload, existing, "encapsulationCode", ""))
            or cls._as_text(cls._pick(payload, existing, "njpCode", ""))
            or cls._next_code(records, product=product, products=cls._product_code_products())
        )
        cls._ensure_unique_code(
            records,
            encapsulation_code,
            current_id=str(existing.get("id") or "") or None,
        )

        temperature_c = cls._pick(payload, existing, "temperatureC")
        temperature_f = cls._pick(payload, existing, "temperatureF")
        if temperature_f is None and temperature_c is not None:
            temperature_f = round(float(temperature_c) * 9 / 5 + 32, 2)

        raw_material_received = cls._pick(
            payload,
            existing,
            "rawMaterialReceivedKg",
            cls._record_available_kg(mixing),
        )
        source_target_fill_weight_mg = cls._target_fill_weight_from_mixing(mixing)
        target_fill_weight_mg = cls._pick(
            payload,
            existing,
            "targetFillWeightMg",
            source_target_fill_weight_mg if source_target_fill_weight_mg > 0 else None,
        )
        empty_capsule_unit_weight_mg = cls._pick(
            payload,
            existing,
            "emptyCapsuleUnitWeightMg",
            cls.EMPTY_CAPSULE_UNIT_WEIGHT_MG,
        )
        gross_filled = cls._capsules_from_mix_kg(raw_material_received, target_fill_weight_mg)
        if gross_filled is None:
            gross_filled = cls._as_int_or_none(
                cls._pick(
                    payload,
                    existing,
                    "grossCapsulesFilledQty",
                    cls._pick(payload, existing, "totalCapsulesFilledQty"),
                )
            )

        rejected = cls._as_int_or_none(cls._pick(payload, existing, "rejectedCapsulesQty")) or 0
        if gross_filled is not None and rejected > gross_filled:
            raise ServiceError(
                f"Rejected capsules qty cannot be greater than total calculated capsules ({gross_filled}).",
                400,
            )

        filled = max(0, int(gross_filled or 0) - rejected) if gross_filled is not None else None
        empty_capsule_weight_kg = cls._empty_capsule_weight_kg(
            filled,
            empty_capsule_unit_weight_mg,
        )
        empty_capsule_weight_mg = (
            round(empty_capsule_weight_kg * 1_000_000, 4)
            if empty_capsule_weight_kg is not None
            else None
        )
        total_capsules_produced_kg = cls._total_capsules_produced_kg(
            filled,
            target_fill_weight_mg,
            empty_capsule_unit_weight_mg,
        )
        rejected_capsules_weight_kg = cls._rejected_capsules_weight_kg(
            rejected,
            target_fill_weight_mg,
            empty_capsule_unit_weight_mg,
        )
        target_modified = (
            source_target_fill_weight_mg > 0
            and target_fill_weight_mg is not None
            and abs(float(target_fill_weight_mg) - source_target_fill_weight_mg) > 0.0001
        )
        yield_percent = cls._pick(payload, existing, "yieldPercent")
        if gross_filled is not None:
            yield_percent = round((filled or 0) / int(gross_filled) * 100, 4) if gross_filled else 0

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
        status = cls._normalize_status(
            cls._pick(payload, existing, "status"),
            completed_by_time=bool(end_date and end_time),
        )

        load_checks = cls._normalize_load_checks(
            cls._pick(payload, existing, "loadChecks", []) or []
        )

        capsule_data = cls._pick(payload, existing, "capsuleData", {}) or {}
        if not isinstance(capsule_data, dict):
            capsule_data = {}
        mixing_location = cls._mixing_location(mixing)
        location = cls._as_text(
            cls._pick(payload, existing, "location", mixing_location)
        ) or mixing_location
        bucket = cls._as_text(cls._pick(payload, existing, "bucket", ""))
        brand_refs = cls._brand_refs_from_mixing(mixing)
        primary_brand = brand_refs[0] if brand_refs else {"id": "", "name": "", "codePrefix": ""}
        brand_ids = [brand["id"] for brand in brand_refs if brand.get("id")]
        brand_names = [brand["name"] for brand in brand_refs if brand.get("name")]

        cleaned = {
            "mixingId": mixing_id,
            "mixingCode": mixing_code,
            "mixingName": mixing_name,
            "brandId": primary_brand.get("id") or "",
            "brandName": primary_brand.get("name") or "",
            "brandIds": brand_ids,
            "brandNames": brand_names,
            "brands": brand_refs,
            "isMultiBrand": len(brand_refs) > 1,
            "productId": mixing.get("productId") or "",
            "productName": mixing.get("productName") or mixing_name,
            "rackNo": mixing_location,
            "location": location,
            "bucket": bucket,
            "mixingTotalKg": round(cls._record_total_kg(mixing), 6),
            "mixingAvailableKg": round(cls._record_available_kg(mixing), 6),
            "mixingAvailableBeforeEncapsulationKg": None,
            "mixingUsedInEncapsulationKg": raw_material_received,
            "mixingAvailableAfterEncapsulationKg": None,
            "mixingAvailableBeforeNJPkg": None,
            "mixingUsedInNJPkg": raw_material_received,
            "mixingAvailableAfterNJPkg": None,
            "sourceTargetFillWeightMg": source_target_fill_weight_mg,
            "targetFillWeightModified": target_modified,
            "encapsulationCode": encapsulation_code,
            "njpCode": encapsulation_code,
            "lotNumber": cls._pick(payload, existing, "lotNumber", mixing_code),
            "capsuleSize": cls._as_text(cls._pick(payload, existing, "capsuleSize", "00")) or "00",
            "machineModel": cls._pick(payload, existing, "machineModel"),
            "machineSpeed": cls._pick(payload, existing, "machineSpeed"),
            "rawMaterialReceivedKg": raw_material_received,
            "targetFillWeightMg": target_fill_weight_mg,
            "emptyCapsuleUnitWeightMg": empty_capsule_unit_weight_mg,
            "emptyCapsuleWeightMg": empty_capsule_weight_mg,
            "emptyCapsuleWeightKg": empty_capsule_weight_kg,
            "totalCapsulesProducedKg": total_capsules_produced_kg,
            "totalCapsulesFilledQty": filled,
            "grossCapsulesFilledQty": gross_filled,
            "netCapsulesFilledQty": filled,
            "rejectedCapsulesQty": rejected,
            "rejectedCapsulesWeightKg": rejected_capsules_weight_kg,
            "temperatureC": temperature_c,
            "temperatureF": temperature_f,
            "humidityPercent": cls._pick(payload, existing, "humidityPercent"),
            "dusterCheck": bool(cls._pick(payload, existing, "dusterCheck", False)),
            "vacuumCheck": bool(cls._pick(payload, existing, "vacuumCheck", False)),
            "yieldPercent": yield_percent,
            "startDate": start_date,
            "startTime": start_time,
            "endDate": end_date,
            "endTime": end_time,
            "productionDate": production_date,
            "encapsulationSessions": sessions,
            "encapsulationTimeLogs": sessions,
            "njpSessions": sessions,
            "njpTimeLogs": sessions,
            "timeLogs": sessions,
            "status": status,
            "encapsulationLoadChecks": load_checks,
            "njpLoadChecks": load_checks,
            "loadChecks": load_checks,
            "remarks": cls._pick(payload, existing, "remarks"),
            "reason": cls._pick(payload, existing, "reason"),
            "changeReason": cls._pick(payload, existing, "changeReason"),
            "operatorName": cls._pick(payload, existing, "operatorName"),
            "capsuleData": {
                **capsule_data,
                "mixingId": mixing_id,
                "mixingCode": mixing_code,
                "mixingName": mixing_name,
                "brandId": primary_brand.get("id") or "",
                "brandName": primary_brand.get("name") or "",
                "brandIds": brand_ids,
                "brandNames": brand_names,
                "brands": brand_refs,
                "productName": mixing.get("productName") or mixing_name,
                "rackNo": mixing_location,
                "location": location,
                "bucket": bucket,
                "rawMaterialReceivedKg": raw_material_received,
                "mixingAvailableBeforeEncapsulationKg": None,
                "mixingUsedInEncapsulationKg": raw_material_received,
                "mixingAvailableAfterEncapsulationKg": None,
                "mixingAvailableBeforeNJPkg": None,
                "mixingUsedInNJPkg": raw_material_received,
                "mixingAvailableAfterNJPkg": None,
                "sourceTargetFillWeightMg": source_target_fill_weight_mg,
                "targetFillWeightModified": target_modified,
                "emptyCapsuleUnitWeightMg": empty_capsule_unit_weight_mg,
                "emptyCapsuleWeightMg": empty_capsule_weight_mg,
                "emptyCapsuleWeightKg": empty_capsule_weight_kg,
                "totalCapsulesProducedKg": total_capsules_produced_kg,
                "grossCapsulesFilledQty": gross_filled,
                "netCapsulesFilledQty": filled,
                "rejectedCapsulesQty": rejected,
                "rejectedCapsulesWeightKg": rejected_capsules_weight_kg,
                "yieldPercent": yield_percent,
                "temperatureF": temperature_f,
                "encapsulationCode": encapsulation_code,
                "njpCode": encapsulation_code,
                "encapsulationSessions": sessions,
                "njpSessions": sessions,
                "encapsulationLoadChecks": load_checks,
                "njpLoadChecks": load_checks,
                "loadChecks": load_checks,
            },
        }

        return to_json_value(cleaned)

NJPRules = EncapsulationRules

__all__ = ["EncapsulationRules", "NJPRules"]
