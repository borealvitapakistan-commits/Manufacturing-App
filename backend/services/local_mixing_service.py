from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from .base_service import ServiceError
from .converters import to_json_value
from .local_json_store import LocalJSONStore


class LocalMixingService:
    store = LocalJSONStore("mixing/mixings.json", [])

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
        "doseMg",
        "dosageMg",
        "nmiDosageMg",
        "labelClaimMgPerUnit",
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
            "dosageMg": dose_mg,
            "labelClaimMgPerUnit": dose_mg,
            "totalUnits": row.get("totalUnits"),
            "requiredQtyKgFormula": cls._as_float_or_none(row.get("requiredQtyKgFormula")),
            "requiredQtyKg": cls._as_float_or_none(row.get("requiredQtyKg")),
            "requiredQtyKgThisMix": cls._as_float_or_none(row.get("requiredQtyKgThisMix")),
            "qtyBeforeKg": cls._as_float_or_none(row.get("qtyBeforeKg")),
            "qtyAfterKg": cls._as_float_or_none(row.get("qtyAfterKg")),
            "usedQtyKg": round(qty, 4),
            "kgUsed": round(qty, 4),
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

        mixed_powder_name = cls._as_text(payload.get("mixedPowderName"))
        if mixed_powder_name:
            total += float(payload.get("existingMixedPowderUsedKg") or 0)

        for key in cls.MATERIAL_SECTIONS:
            total += sum(cls._row_qty(row) for row in payload.get(key) or [])

        return round(total, 4)

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

        mixed_powder_name = cls._as_text(pick("mixedPowderName", ""))
        existing_powder_qty = pick("existingMixedPowderUsedKg", None)

        # TBD: mixed powder name will be discussed later.
        # Keeping this field optional and backward-compatible only.
        if not mixed_powder_name:
            existing_powder_qty = None
        else:
            existing_powder_qty = cls._as_float_or_none(existing_powder_qty) or 0

        medicinal_ingredients = cls._pick_medicinal_rows(payload, existing)
        non_medicinal_ingredients = cls._pick_nmi_rows(payload, existing)

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

        cleaned = {
            **existing,
            "brandId": pick("brandId", "") or "",
            "brandName": cls._as_text(pick("brandName", "")),
            "productId": pick("productId", "") or "",
            "productName": cls._as_text(pick("productName", "")),
            "mixingCode": mixing_code,
            "startDate": start_date,
            "startTime": start_time or "",
            "endDate": end_date,
            "endTime": end_time or "",
            "mixingDate": start_date,
            "mixingDates": mixing_dates,
            "mixingSessions": sessions,
            "mixedPowderName": mixed_powder_name,
            "existingMixedPowderUsedKg": existing_powder_qty,
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
        cleaned.pop("batchId", None)

        cls._ensure_unique_code(
            records,
            str(cleaned["mixingCode"]),
            current_id=str(existing.get("id") or "") or None,
        )

        calculated_total = cls._calculate_material_total(cleaned)
        manual_total = cls._pick_manual_total_kg(payload, existing, calculated_total)

        cleaned["totalFormulaQtyKg"] = calculated_total
        cleaned["totalKgInMixing"] = manual_total
        cleaned["totalKg"] = manual_total
        cleaned["totalMixingKg"] = manual_total
        cleaned["totalMixedQtyKg"] = manual_total

        return to_json_value(cleaned)

    @classmethod
    def _material_signature(cls, record: dict[str, Any]) -> str:
        signature = {
            "mixedPowderName": record.get("mixedPowderName") or "",
            "existingMixedPowderUsedKg": record.get("existingMixedPowderUsedKg"),
            "totalKgInMixing": record.get("totalKgInMixing"),
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
    def list(
        cls,
        *,
        brand_id: str | None = None,
        product_id: str | None = None,
        mixing_code: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        records = cls.store.read()

        if brand_id:
            records = [
                record for record in records if str(record.get("brandId")) == str(brand_id)
            ]

        if product_id:
            records = [
                record
                for record in records
                if str(record.get("productId")) == str(product_id)
            ]

        if mixing_code:
            records = [
                record
                for record in records
                if str(record.get("mixingCode") or "").lower()
                == str(mixing_code).lower()
            ]

        if search:
            query = str(search).strip().lower()

            def matches(record: dict[str, Any]) -> bool:
                main_text = " ".join(
                    [
                        str(record.get("mixingCode") or ""),
                        str(record.get("brandName") or ""),
                        str(record.get("productName") or ""),
                    ]
                ).lower()

                if query in main_text:
                    return True

                for section in cls.MATERIAL_SECTIONS:
                    for row in record.get(section) or []:
                        row_text = " ".join(
                            [
                                str(row.get("rawMaterialName") or ""),
                                str(row.get("rawMaterialCode") or ""),
                                str(row.get("rmCategoryName") or ""),
                                str(row.get("rmCategoryCode") or ""),
                                str(row.get("remarks") or ""),
                            ]
                        ).lower()

                        if query in row_text:
                            return True

                return False

            records = [record for record in records if matches(record)]

        records = sorted(
            records,
            key=lambda item: item.get("createdAt") or 0,
            reverse=True,
        )

        return records[:limit]

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        for record in cls.store.read():
            if record.get("id") == item_id:
                return record

        raise ServiceError("Mixing record not found", 404)

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        records = cls.store.read()
        now = cls._now_ms()

        cleaned = cls._clean_payload(payload, records=records)

        record = {
            "id": str(uuid4()),
            **cleaned,
            "revisionNo": 1,
            "changeHistory": [],
            "lastMaterialChangeAt": None,
            "lastMaterialChangeDisclaimer": cls.EDIT_DISCLAIMER,
            "createdAt": now,
            "updatedAt": now,
        }

        records.append(record)
        cls.store.write(records)

        return record

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        records = cls.store.read()
        now = cls._now_ms()

        for index, record in enumerate(records):
            if record.get("id") == item_id:
                cleaned = cls._clean_payload(
                    payload,
                    existing=record,
                    records=records,
                )

                material_changed = (
                    cls._material_signature(record)
                    != cls._material_signature(cleaned)
                )

                updated = {
                    **cleaned,
                    "id": record["id"],
                    "createdAt": record.get("createdAt"),
                    "updatedAt": now,
                }

                updated.pop("status", None)

                updated = cls._append_change_history(
                    existing=record,
                    updated=updated,
                    now=now,
                    changed=material_changed,
                )

                records[index] = updated
                cls.store.write(records)

                return updated

        raise ServiceError("Mixing record not found", 404)

    @classmethod
    def delete(cls, item_id: str) -> dict[str, Any]:
        records = cls.store.read()
        next_records = [record for record in records if record.get("id") != item_id]

        if len(next_records) == len(records):
            raise ServiceError("Mixing record not found", 404)

        cls.store.write(next_records)

        return {"success": True}