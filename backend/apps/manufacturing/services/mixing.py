from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from services.base_service import ServiceError
from services.converters import to_json_value


class MixingRules:
    EDIT_DISCLAIMER = (
        "This mixing record is editable. If any raw material is added, removed, "
        "or any quantity/dose is changed, the updated record must be reviewed and "
        "the latest saved version will be treated as the effective mixing record."
    )

    # New clean sections.
    MATERIAL_SECTIONS = (
        "medicinalIngredients",
        "nonMedicinalIngredients",
    )

    # Old/legacy sections kept only for backward compatibility.
    LEGACY_MEDICINAL_SECTIONS = (
        "rmUsage",
        "byBookRawMaterials",
        "pragmaticRawMaterials",
        "rawMaterials",
        "formulaRawMaterials",
        "additionalRawMaterials",
        "extraRawMaterials",
    )

    LEGACY_NMI_SECTIONS = (
        "nonMedUsage",
        "nmiUsage",
        "nonMedicinalUsage",
        "nonMedicinalRawMaterials",
    )

    QTY_KEYS = (
        "usedQtyKg",
        "kgUsed",
        "requiredQtyKgThisMix",
        "requiredQtyKg",
        "requiredQtyKgFormula",
        "qtyKg",
    )

    DOSE_KEYS = (
        "mgDoseUsed",
        "mgDose",
        "doseMg",
        "dosageMg",
        "nmiDosageMg",
        "labelClaimMgPerUnit",
        "labelClaimMg",
    )

    TOTAL_KG_KEYS = (
        "totalKgInMixing",
        "totalKg",
        "totalMixingKg",
        "totalMixedQtyKg",
    )

    @staticmethod
    def _now_ms() -> int:
        return int(datetime.now().timestamp() * 1000)

    @staticmethod
    def _as_text(value: Any) -> str:
        return str(value or "").strip()

    @classmethod
    def _product_by_id(cls, product_id: Any) -> dict[str, Any]:
        product_id_text = cls._as_text(product_id)
        if not product_id_text:
            return {}

        return {}

    @classmethod
    def _with_product_identity(cls, record: dict[str, Any]) -> dict[str, Any]:
        enriched = dict(record)
        product = cls._product_by_id(enriched.get("productId"))
        product_code = cls._as_text(
            enriched.get("productCode")
            or enriched.get("product_code")
            or enriched.get("productNo")
            or enriched.get("product_no")
            or enriched.get("productNumber")
            or enriched.get("product_number")
            or product.get("productCode")
            or product.get("product_code")
            or product.get("productNo")
            or product.get("product_no")
            or product.get("productNumber")
            or product.get("product_number")
            or product.get("code")
            or product.get("npn")
        )
        npn = cls._as_text(
            enriched.get("npn")
            or enriched.get("productNpn")
            or enriched.get("product_npn")
            or product.get("npn")
        )

        if product_code:
            enriched["productCode"] = product_code
        if npn:
            enriched["npn"] = npn

        return enriched

    @classmethod
    def _normalize_brand_refs(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
    ) -> list[dict[str, str]]:
        refs: list[dict[str, str]] = []

        def add_ref(
            brand_id: Any = "",
            brand_name: Any = "",
            code_prefix: Any = "",
        ) -> None:
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

        source_brands = payload.get("brands") if "brands" in payload else existing.get("brands")
        if isinstance(source_brands, list):
            for item in source_brands:
                if isinstance(item, dict):
                    add_ref(
                        item.get("id") or item.get("brandId"),
                        item.get("name") or item.get("brandName"),
                        item.get("codePrefix")
                        or item.get("code_prefix")
                        or item.get("prefix")
                        or item.get("code"),
                    )
                else:
                    add_ref(item)

        source_ids = payload.get("brandIds") if "brandIds" in payload else existing.get("brandIds")
        source_names = payload.get("brandNames") if "brandNames" in payload else existing.get("brandNames")
        if isinstance(source_ids, list) or isinstance(source_names, list):
            ids = source_ids if isinstance(source_ids, list) else []
            names = source_names if isinstance(source_names, list) else []
            for index, brand_id in enumerate(ids):
                add_ref(brand_id, names[index] if index < len(names) else "")
            for index, brand_name in enumerate(names):
                add_ref(ids[index] if index < len(ids) else "", brand_name)

        add_ref(
            payload.get("brandId") if "brandId" in payload else existing.get("brandId"),
            payload.get("brandName") if "brandName" in payload else existing.get("brandName"),
            payload.get("brandCodePrefix")
            if "brandCodePrefix" in payload
            else existing.get("brandCodePrefix"),
        )

        return refs

    @staticmethod
    def _record_has_brand(record: dict[str, Any], brand_id: str) -> bool:
        brand_id_text = str(brand_id)
        if str(record.get("brandId")) == brand_id_text:
            return True

        return any(str(item) == brand_id_text for item in record.get("brandIds") or [])

    @staticmethod
    def _as_float_or_none(value: Any) -> float | None:
        if value in (None, ""):
            return None

        try:
            return round(float(value), 6)
        except (TypeError, ValueError):
            raise ServiceError("Invalid numeric value in mixing record", 400)

    @classmethod
    def _first_float(cls, source: dict[str, Any], keys: tuple[str, ...]) -> float | None:
        for key in keys:
            number = cls._as_float_or_none(source.get(key))
            if number is not None:
                return number

        return None

    @classmethod
    def _row_qty(cls, row: dict[str, Any]) -> float:
        number = cls._first_float(row, cls.QTY_KEYS)
        return float(number or 0)

    @classmethod
    def _row_dose_mg(cls, row: dict[str, Any]) -> float | None:
        return cls._first_float(row, cls.DOSE_KEYS)

    @staticmethod
    def _looks_like_nmi(value: Any) -> bool:
        text = str(value or "").strip().lower()

        return text in {
            "mma",
            "nmi",
            "non medicinal",
            "non-medicinal",
            "non medicinal ingredient",
            "non-medicinal ingredient",
            "non medicinal ingredients",
            "non-medicinal ingredients",
        }

    @classmethod
    def _normalize_row(
        cls,
        row: dict[str, Any],
        *,
        force_nmi: bool = False,
    ) -> dict[str, Any] | None:
        raw_material_id = row.get("rawMaterialId") or ""
        raw_material_code = cls._as_text(row.get("rawMaterialCode"))
        raw_material_name = cls._as_text(
            row.get("rawMaterialName")
            or row.get("name")
            or row.get("nmiName")
        )

        rm_category_id = (
            row.get("rmCategoryId")
            or row.get("rawMaterialCategoryId")
            or row.get("categoryId")
            or ""
        )

        rm_category_code = cls._as_text(
            row.get("rmCategoryCode")
            or row.get("rawMaterialCategoryCode")
            or row.get("categoryCode")
        )

        rm_category_name = cls._as_text(
            row.get("rmCategoryName")
            or row.get("rawMaterialCategoryName")
            or row.get("categoryName")
            or row.get("category")
        )

        qty = cls._row_qty(row)
        dose_mg = cls._row_dose_mg(row)
        remarks = cls._as_text(row.get("remarks"))

        is_nmi = bool(row.get("isNMI") or row.get("isNonMedicinal"))
        is_nmi = (
            force_nmi
            or is_nmi
            or cls._looks_like_nmi(rm_category_code)
            or cls._looks_like_nmi(rm_category_name)
        )

        # NMI comes from Raw Material category MMA.
        # Frontend does not need to manually send category for NMI.
        if is_nmi:
            if not rm_category_code:
                rm_category_code = "MMA"

            if not rm_category_name:
                rm_category_name = "MMA"

        if not any(
            [
                raw_material_id,
                raw_material_code,
                raw_material_name,
                rm_category_id,
                rm_category_code,
                rm_category_name,
                qty > 0,
                dose_mg is not None,
                remarks,
            ]
        ):
            return None

        normalized = {
            "clNo": row.get("clNo"),
            "rawMaterialId": raw_material_id,
            "rawMaterialCode": raw_material_code,
            "rawMaterialName": raw_material_name,
            "name": raw_material_name,
            "rmCategoryId": rm_category_id,
            "rmCategoryCode": rm_category_code,
            "rmCategoryName": rm_category_name,
            "rawMaterialCategoryId": rm_category_id,
            "rawMaterialCategoryCode": rm_category_code,
            "rawMaterialCategoryName": rm_category_name,
            "category": rm_category_name or rm_category_code,
            "isNMI": is_nmi,
            "isNonMedicinal": is_nmi,
            "doseMg": dose_mg,
            "mgDoseUsed": dose_mg,
            "mgDose": dose_mg,
            "dosageMg": dose_mg,
            "labelClaimMgPerUnit": dose_mg,
            "labelClaimMg": dose_mg,
            "totalUnits": row.get("totalUnits"),
            "requiredQtyKgFormula": cls._as_float_or_none(row.get("requiredQtyKgFormula")),
            "requiredQtyKg": cls._as_float_or_none(row.get("requiredQtyKg")),
            "requiredQtyKgThisMix": cls._as_float_or_none(row.get("requiredQtyKgThisMix")),
            "qtyBeforeKg": cls._as_float_or_none(row.get("qtyBeforeKg")),
            "qtyAfterKg": cls._as_float_or_none(row.get("qtyAfterKg")),
            "usedQtyKg": round(qty, 6),
            "kgUsed": round(qty, 6),
            "qtyUsedKg": round(qty, 6),
            "percentShare": cls._as_float_or_none(row.get("percentShare")),
            "ratioPercent": cls._as_float_or_none(row.get("ratioPercent")),
            "remarks": remarks,
        }

        return to_json_value(normalized)

    @classmethod
    def _normalize_rows(
        cls,
        rows: list[dict[str, Any]] | None,
        *,
        force_nmi: bool = False,
    ) -> list[dict[str, Any]]:
        normalized = []

        for row in rows or []:
            clean_row = cls._normalize_row(row, force_nmi=force_nmi)
            if clean_row:
                normalized.append(clean_row)

        return normalized

    @classmethod
    def _calculate_material_total(cls, payload: dict[str, Any]) -> float:
        total = 0.0

        has_existing_powder = any(
            [
                cls._as_text(payload.get("mixedPowderName")),
                cls._as_text(payload.get("existingMixedPowderId")),
                cls._as_text(payload.get("existingMixedPowderCode")),
                payload.get("existingMixedPowderUsedKg") not in (None, ""),
            ]
        )
        if has_existing_powder:
            total += float(payload.get("existingMixedPowderUsedKg") or 0)

        for key in cls.MATERIAL_SECTIONS:
            total += sum(cls._row_qty(row) for row in payload.get(key) or [])

        return round(total, 4)

    @classmethod
    def _row_total(cls, rows: list[dict[str, Any]]) -> float:
        return round(sum(cls._row_qty(row) for row in rows or []), 6)

    @classmethod
    def _dose_total(cls, rows: list[dict[str, Any]]) -> float:
        return round(
            sum(
                float(dose)
                for row in rows or []
                for dose in [cls._row_dose_mg(row)]
                if dose is not None and dose > 0
            ),
            6,
        )

    @classmethod
    def _recalculate_rows_for_fresh_mix(
        cls,
        rows: list[dict[str, Any]],
        *,
        fresh_mix_kg: float,
        total_dose_mg: float,
    ) -> list[dict[str, Any]]:
        if fresh_mix_kg <= 0 or total_dose_mg <= 0:
            return rows

        recalculated = []
        for row in rows:
            dose_mg = cls._row_dose_mg(row)
            next_row = dict(row)

            if dose_mg is None or dose_mg <= 0:
                next_row.update(
                    {
                        "usedQtyKg": 0,
                        "kgUsed": 0,
                        "qtyUsedKg": 0,
                        "requiredQtyKgThisMix": 0,
                        "requiredQtyKgFormula": 0,
                        "percentShare": 0,
                        "ratioPercent": 0,
                    }
                )
                recalculated.append(to_json_value(next_row))
                continue

            percent = round((dose_mg / total_dose_mg) * 100, 6)
            kg_used = round((fresh_mix_kg * dose_mg) / total_dose_mg, 6)

            next_row.update(
                {
                    "doseMg": round(dose_mg, 6),
                    "mgDoseUsed": round(dose_mg, 6),
                    "mgDose": round(dose_mg, 6),
                    "dosageMg": round(dose_mg, 6),
                    "labelClaimMgPerUnit": round(dose_mg, 6),
                    "labelClaimMg": round(dose_mg, 6),
                    "usedQtyKg": kg_used,
                    "kgUsed": kg_used,
                    "qtyUsedKg": kg_used,
                    "requiredQtyKgThisMix": kg_used,
                    "requiredQtyKgFormula": kg_used,
                    "percentShare": percent,
                    "ratioPercent": percent,
                }
            )
            recalculated.append(to_json_value(next_row))

        return recalculated

    @staticmethod
    def _within_tolerance(left: float, right: float, tolerance: float = 0.0005) -> bool:
        return abs(round(left, 6) - round(right, 6)) <= tolerance

    @classmethod
    def _pick_manual_total_kg(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
        calculated_total: float,
    ) -> float | None:
        for key in cls.TOTAL_KG_KEYS:
            if key in payload:
                return cls._as_float_or_none(payload.get(key))

        for key in cls.TOTAL_KG_KEYS:
            if key in existing:
                return cls._as_float_or_none(existing.get(key))

        return calculated_total

    @classmethod
    def _normalize_sessions(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        existing = existing or {}

        source = None
        for key in ("mixingSessions", "mixingTimeLogs", "timeLogs", "sessions"):
            if key in payload:
                source = payload.get(key)
                break

        if source is None:
            legacy_keys = {"mixingDate", "startDate", "startTime", "endDate", "endTime"}
            if not any(key in payload for key in legacy_keys):
                return existing.get("mixingSessions", []) or []

            start_date = payload.get("startDate", existing.get("startDate"))
            end_date = payload.get("endDate", existing.get("endDate"))
            mixing_date = payload.get("mixingDate", existing.get("mixingDate"))

            if not start_date:
                start_date = mixing_date

            if not end_date:
                end_date = start_date

            source = [
                {
                    "date": start_date,
                    "startDate": start_date,
                    "startTime": payload.get("startTime", existing.get("startTime")),
                    "endDate": end_date,
                    "endTime": payload.get("endTime", existing.get("endTime")),
                    "remarks": payload.get("remarks", ""),
                }
            ]

        sessions = []

        for item in source or []:
            date = item.get("date") or item.get("mixingDate") or item.get("startDate")
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
    def _first_session_value(
        sessions: list[dict[str, Any]],
        key: str,
        default: Any = None,
    ) -> Any:
        if not sessions:
            return default

        return sessions[0].get(key, default)

    @staticmethod
    def _last_session_value(
        sessions: list[dict[str, Any]],
        key: str,
        default: Any = None,
    ) -> Any:
        if not sessions:
            return default

        return sessions[-1].get(key, default)

    @classmethod
    def _next_code(cls, records: list[dict[str, Any]]) -> str:
        highest = 0

        for record in records:
            code = str(record.get("mixingCode") or "")
            if code.startswith("MIX-") and code[4:].isdigit():
                highest = max(highest, int(code[4:]))

        return f"MIX-{highest + 1:04d}"

    @staticmethod
    def _ensure_unique_code(
        records: list[dict[str, Any]],
        mixing_code: str,
        *,
        current_id: str | None = None,
    ) -> None:
        normalized = mixing_code.strip().lower()

        for record in records:
            if current_id and str(record.get("id")) == current_id:
                continue

            if str(record.get("mixingCode") or "").strip().lower() == normalized:
                raise ServiceError("Mixing code already exists", 409)

    @classmethod
    def _pick_medicinal_rows(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if "medicinalIngredients" in payload:
            return cls._normalize_rows(payload.get("medicinalIngredients"))

        collected = []

        for key in cls.LEGACY_MEDICINAL_SECTIONS:
            if key in payload:
                collected.extend(payload.get(key) or [])

        if collected:
            return cls._normalize_rows(collected)

        if existing.get("medicinalIngredients"):
            return existing.get("medicinalIngredients") or []

        collected_existing = []
        for key in cls.LEGACY_MEDICINAL_SECTIONS:
            collected_existing.extend(existing.get(key) or [])

        return cls._normalize_rows(collected_existing)

    @classmethod
    def _pick_nmi_rows(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if "nonMedicinalIngredients" in payload:
            return cls._normalize_rows(
                payload.get("nonMedicinalIngredients"),
                force_nmi=True,
            )

        collected = []

        for key in cls.LEGACY_NMI_SECTIONS:
            if key in payload:
                collected.extend(payload.get(key) or [])

        if collected:
            return cls._normalize_rows(collected, force_nmi=True)

        if existing.get("nonMedicinalIngredients"):
            return existing.get("nonMedicinalIngredients") or []

        collected_existing = []
        for key in cls.LEGACY_NMI_SECTIONS:
            collected_existing.extend(existing.get(key) or [])

        return cls._normalize_rows(collected_existing, force_nmi=True)

    @classmethod
    def _clean_payload(
        cls,
        payload: dict[str, Any],
        *,
        existing: dict[str, Any] | None = None,
        records: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        records = records or []
        existing = existing or {}

        def pick(key: str, default: Any = "") -> Any:
            return payload[key] if key in payload else existing.get(key, default)

        medicinal_ingredients = cls._pick_medicinal_rows(payload, existing)
        non_medicinal_ingredients = cls._pick_nmi_rows(payload, existing)
        all_ingredients = [*medicinal_ingredients, *non_medicinal_ingredients]

        existing_powder_payload = (
            payload.get("existingMixedPowder")
            if isinstance(payload.get("existingMixedPowder"), dict)
            else existing.get("existingMixedPowder")
            if isinstance(existing.get("existingMixedPowder"), dict)
            else {}
        )
        existing_powder_id = cls._as_text(
            pick("existingMixedPowderId", "")
            or existing_powder_payload.get("id")
            or existing_powder_payload.get("mixingId")
        )
        existing_powder_code = cls._as_text(
            pick("existingMixedPowderCode", "")
            or existing_powder_payload.get("mixingCode")
            or existing_powder_payload.get("code")
        )
        existing_powder_source = (
            cls._as_text(pick("existingMixedPowderSource", ""))
            or cls._as_text(existing_powder_payload.get("source"))
            or ("mixing" if existing_powder_id else "")
        )
        mixed_powder_name = cls._as_text(
            pick("mixedPowderName", "")
            or existing_powder_payload.get("name")
            or existing_powder_payload.get("mixingCode")
        )
        existing_powder_qty_raw = pick(
            "existingMixedPowderUsedKg",
            existing_powder_payload.get("usedKg"),
        )
        has_existing_powder = any(
            [
                existing_powder_id,
                existing_powder_code,
                mixed_powder_name,
                existing_powder_qty_raw not in (None, ""),
            ]
        )
        existing_powder_qty = (
            cls._as_float_or_none(existing_powder_qty_raw) or 0
            if has_existing_powder
            else 0
        )

        if existing_powder_qty < 0:
            raise ServiceError(
                "Existing mixed powder used kg cannot be negative. Enter 0 or a positive kg value.",
                400,
            )

        calculated_before_reuse = round(
            existing_powder_qty + cls._row_total(all_ingredients),
            6,
        )
        total_required_kg = cls._pick_manual_total_kg(
            payload,
            existing,
            calculated_before_reuse,
        )
        total_required_kg = float(total_required_kg or 0)

        if has_existing_powder and total_required_kg <= 0:
            raise ServiceError(
                "Total Kg in Mixing is required when using existing mixed powder. Example: total 40 kg with 10 kg existing means 30 kg fresh mixing.",
                400,
            )

        if existing_powder_qty and existing_powder_qty >= total_required_kg:
            raise ServiceError(
                f"Existing mixed powder used ({existing_powder_qty:g} kg) must be less than Total Kg in Mixing ({total_required_kg:g} kg), so the fresh balance can be calculated.",
                400,
            )

        fresh_mix_kg = round(total_required_kg - existing_powder_qty, 6)
        total_dose_mg = cls._dose_total(all_ingredients)
        if total_required_kg > 0 and total_dose_mg > 0:
            medicinal_ingredients = cls._recalculate_rows_for_fresh_mix(
                medicinal_ingredients,
                fresh_mix_kg=fresh_mix_kg,
                total_dose_mg=total_dose_mg,
            )
            non_medicinal_ingredients = cls._recalculate_rows_for_fresh_mix(
                non_medicinal_ingredients,
                fresh_mix_kg=fresh_mix_kg,
                total_dose_mg=total_dose_mg,
            )
            all_ingredients = [*medicinal_ingredients, *non_medicinal_ingredients]

        fresh_materials_total = cls._row_total(all_ingredients)
        if total_required_kg > 0 and fresh_mix_kg > 0 and not cls._within_tolerance(
            fresh_materials_total,
            fresh_mix_kg,
        ):
            raise ServiceError(
                f"Fresh mixing required is {fresh_mix_kg:g} kg, but calculated raw materials total is {fresh_materials_total:g} kg. Check Total Kg in Mixing, reused kg, or MG dose values.",
                400,
            )

        sessions = cls._normalize_sessions(payload, existing)

        start_date = cls._first_session_value(
            sessions,
            "startDate",
            pick("startDate", None),
        )
        start_time = cls._first_session_value(
            sessions,
            "startTime",
            pick("startTime", ""),
        )
        end_date = cls._last_session_value(
            sessions,
            "endDate",
            pick("endDate", None),
        )
        end_time = cls._last_session_value(
            sessions,
            "endTime",
            pick("endTime", ""),
        )

        mixing_dates = []
        for session in sessions:
            session_date = session.get("date") or session.get("startDate")
            if session_date and session_date not in mixing_dates:
                mixing_dates.append(session_date)

        mixing_code = cls._as_text(pick("mixingCode", "")) or cls._next_code(records)

        location = cls._as_text(pick("location", pick("rackNo", "")))
        product = cls._product_by_id(pick("productId", ""))
        product_code = cls._as_text(
            pick(
                "productCode",
                pick(
                    "product_code",
                    pick(
                        "productNo",
                        pick(
                            "product_no",
                            pick("productNumber", pick("product_number", "")),
                        ),
                    ),
                ),
            )
        ) or cls._as_text(
            product.get("productCode")
            or product.get("product_code")
            or product.get("productNo")
            or product.get("product_no")
            or product.get("productNumber")
            or product.get("product_number")
            or product.get("code")
            or product.get("npn")
        )
        npn = cls._as_text(
            pick("npn", pick("productNpn", pick("product_npn", "")))
        ) or cls._as_text(product.get("npn"))
        brand_refs = cls._normalize_brand_refs(payload, existing)
        primary_brand = brand_refs[0] if brand_refs else {"id": "", "name": "", "codePrefix": ""}
        brand_ids = [brand["id"] for brand in brand_refs if brand.get("id")]
        brand_names = [brand["name"] for brand in brand_refs if brand.get("name")]

        cleaned = {
            **existing,
            "brandId": primary_brand.get("id") or "",
            "brandName": primary_brand.get("name") or "",
            "brandIds": brand_ids,
            "brandNames": brand_names,
            "brands": brand_refs,
            "isMultiBrand": len(brand_refs) > 1,
            "productId": pick("productId", "") or "",
            "productName": cls._as_text(pick("productName", "")),
            "productCode": product_code,
            "npn": npn,
            "mixingCode": mixing_code,
            "location": location,
            "rackNo": location,
            "startDate": start_date,
            "startTime": start_time or "",
            "endDate": end_date,
            "endTime": end_time or "",
            "mixingDate": start_date,
            "mixingDates": mixing_dates,
            "mixingSessions": sessions,
            "mixedPowderName": mixed_powder_name,
            "existingMixedPowderId": existing_powder_id,
            "existingMixedPowderCode": existing_powder_code,
            "existingMixedPowderSource": existing_powder_source,
            "existingMixedPowderUsedKg": existing_powder_qty if has_existing_powder else None,
            "existingMixedPowder": (
                {
                    "id": existing_powder_id,
                    "mixingCode": existing_powder_code,
                    "source": existing_powder_source,
                    "productId": pick("productId", "") or "",
                    "name": mixed_powder_name or existing_powder_code,
                    "usedKg": existing_powder_qty,
                }
                if has_existing_powder
                else None
            ),
            "medicinalIngredients": medicinal_ingredients,
            "nonMedicinalIngredients": non_medicinal_ingredients,
            "remarks": pick("remarks", "") or "",
            "reason": pick("reason", "") or "",
            "changeReason": pick("changeReason", pick("reason", "")) or "",
            "isEditable": True,
            "editDisclaimer": cls.EDIT_DISCLAIMER,
        }

        # Backward-compatible aliases for any old frontend/table code.
        cleaned["rmUsage"] = medicinal_ingredients
        cleaned["byBookRawMaterials"] = medicinal_ingredients
        cleaned["pragmaticRawMaterials"] = []
        cleaned["nonMedUsage"] = non_medicinal_ingredients

        cleaned.pop("status", None)
        cleaned.pop("productNumber", None)

        cls._ensure_unique_code(
            records,
            str(cleaned["mixingCode"]),
            current_id=str(existing.get("id") or "") or None,
        )

        cleaned["freshMixingRequiredKg"] = fresh_mix_kg
        cleaned["calculatedFreshRawMaterialsTotalKg"] = fresh_materials_total
        cleaned["totalFormulaQtyKg"] = total_required_kg
        cleaned["totalKgInMixing"] = total_required_kg
        cleaned["totalKg"] = total_required_kg
        cleaned["totalMixingKg"] = total_required_kg
        cleaned["totalMixedQtyKg"] = total_required_kg

        return to_json_value(cleaned)

    @classmethod
    def _material_signature(cls, record: dict[str, Any]) -> str:
        signature = {
            "existingMixedPowderId": record.get("existingMixedPowderId") or "",
            "existingMixedPowderCode": record.get("existingMixedPowderCode") or "",
            "mixedPowderName": record.get("mixedPowderName") or "",
            "existingMixedPowderUsedKg": record.get("existingMixedPowderUsedKg"),
            "totalKgInMixing": record.get("totalKgInMixing"),
            "freshMixingRequiredKg": record.get("freshMixingRequiredKg"),
            "sections": {},
        }

        for section in cls.MATERIAL_SECTIONS:
            rows = []

            for row in record.get(section) or []:
                rows.append(
                    {
                        "rawMaterialId": row.get("rawMaterialId") or "",
                        "rawMaterialCode": row.get("rawMaterialCode") or "",
                        "rawMaterialName": str(row.get("rawMaterialName") or "").lower(),
                        "rmCategoryId": row.get("rmCategoryId") or "",
                        "rmCategoryCode": row.get("rmCategoryCode") or "",
                        "rmCategoryName": str(row.get("rmCategoryName") or "").lower(),
                        "isNMI": bool(row.get("isNMI")),
                        "doseMg": row.get("doseMg"),
                        "usedQtyKg": row.get("usedQtyKg"),
                        "kgUsed": row.get("kgUsed"),
                        "remarks": row.get("remarks") or "",
                    }
                )

            signature["sections"][section] = rows

        return json.dumps(signature, sort_keys=True, separators=(",", ":"))

    @classmethod
    def _append_change_history(
        cls,
        *,
        existing: dict[str, Any],
        updated: dict[str, Any],
        now: int,
        changed: bool,
    ) -> dict[str, Any]:
        history = list(existing.get("changeHistory") or [])

        if not changed:
            updated["revisionNo"] = existing.get("revisionNo") or 1
            updated["changeHistory"] = history
            updated["lastMaterialChangeAt"] = existing.get("lastMaterialChangeAt")
            updated["lastMaterialChangeDisclaimer"] = existing.get(
                "lastMaterialChangeDisclaimer",
                cls.EDIT_DISCLAIMER,
            )
            return updated

        history.append(
            {
                "changedAt": now,
                "revisionNo": int(existing.get("revisionNo") or 1) + 1,
                "reason": updated.get("changeReason") or updated.get("reason") or "",
                "disclaimer": cls.EDIT_DISCLAIMER,
            }
        )

        updated["revisionNo"] = int(existing.get("revisionNo") or 1) + 1
        updated["changeHistory"] = history
        updated["lastMaterialChangeAt"] = now
        updated["lastMaterialChangeDisclaimer"] = cls.EDIT_DISCLAIMER

        return updated

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
    def _record_available_powder_kg(cls, record: dict[str, Any]) -> float:
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

    @staticmethod
    def _existing_powder_usage(record: dict[str, Any]) -> tuple[str, str, float]:
        source_id = str(record.get("existingMixedPowderId") or "").strip()
        source_type = str(record.get("existingMixedPowderSource") or "mixing").strip()
        used_kg = float(record.get("existingMixedPowderUsedKg") or 0)
        return source_type or "mixing", source_id, used_kg

    @classmethod
    def _material_rows(cls, record: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            *(record.get("medicinalIngredients") or []),
            *(record.get("nonMedicinalIngredients") or []),
        ]

__all__ = ["MixingRules"]
