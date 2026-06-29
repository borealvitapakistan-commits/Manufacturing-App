from __future__ import annotations

from datetime import datetime
from typing import Any

from .base_service import ServiceError, TableService, translate_error
from .catalog_service import BrandService, LabelService, ProductService
from .converters import to_json_value


UNIT_BASED_FORMS = {"capsule", "tablet", "softgel", "lozenge", "oil"}


def _current_date_ms() -> int:
    now = datetime.now()
    return int(datetime(now.year, now.month, now.day).timestamp() * 1000)


def _current_time() -> str:
    return datetime.now().strftime("%H:%M")


def _first_value(payload: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value = payload.get(key)
        if value not in {None, ""}:
            return value
    return default


BATCH_LIFECYCLE_KEYS = {
    "batchStatus",
    "currentStage",
    "batchStartDate",
    "batchStartTime",
    "batchEndDate",
    "batchEndTime",
    "batchRemarks",
    "reason",
}

STAGE_LIFECYCLE_KEYS = {
    "startDate",
    "startTime",
    "endDate",
    "endTime",
    "status",
    "remarks",
    "reason",
}


class BatchService(TableService):
    table_name = "batches"

    @staticmethod
    def _creation_lifecycle(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "batchStatus": payload.get("batchStatus") or "Batch Created",
            "currentStage": payload.get("currentStage") or "batch",
            "batchStartDate": _first_value(
                payload,
                "batchStartDate",
                "startDate",
                default=_current_date_ms(),
            ),
            "batchStartTime": _first_value(
                payload,
                "batchStartTime",
                "startTime",
                default=_current_time(),
            ),
            "batchEndDate": _first_value(payload, "batchEndDate", "endDate"),
            "batchEndTime": _first_value(payload, "batchEndTime", "endTime"),
            "batchRemarks": _first_value(payload, "batchRemarks", "remarks"),
            "reason": payload.get("reason"),
        }

    @classmethod
    def generate_code(cls, brand_id: str, prefix: str) -> str:
        try:
            response = (
                cls.client()
                .table("batches")
                .select("batch_code")
                .eq("brand_id", brand_id)
                .order("batch_code", desc=True)
                .limit(50)
                .execute()
            )
            highest = 0
            for row in response.data or []:
                code = str(row.get("batch_code") or "")
                suffix = code[len(prefix):] if code.startswith(prefix) else code.replace(prefix, "", 1)
                if suffix.isdigit():
                    highest = max(highest, int(suffix))
            return f"{prefix}{highest + 1:03d}"
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        brand = BrandService.get(str(payload["brandId"]))
        product = ProductService.get(str(payload["productId"]))
        units = payload.get("unitsPerContainer")
        containers = int(payload["containerCount"])
        total_units = payload.get("totalUnits")
        if payload["dosageForm"] in UNIT_BASED_FORMS:
            if not units:
                raise ServiceError("unitsPerContainer is required for this dosage form", 400)
            total_units = int(units) * containers
        else:
            total_units = None

        batch_code = payload.get("manualBatchCode") or cls.generate_code(
            str(payload["brandId"]), str(brand["codePrefix"])
        )
        params = {
            "p_brand_id": str(payload["brandId"]),
            "p_brand_name": brand["name"],
            "p_brand_code_prefix": brand["codePrefix"],
            "p_batch_code": batch_code,
            "p_product_id": str(payload["productId"]),
            "p_product_name": product["name"],
            "p_dosage_form": payload["dosageForm"],
            "p_units_per_container": units,
            "p_container_count": containers,
            "p_total_units": total_units,
            "p_notes": payload.get("notes", ""),
            "p_created_by": payload.get("createdBy"),
            "p_start_time": payload.get("startTime"),
            "p_end_time": payload.get("endTime"),
        }
        try:
            response = cls.client().rpc(
                "create_batch_with_inventory_deduction", to_json_value(params)
            ).execute()
            batch_id = str(response.data)
            TableService.update.__func__(
                cls,
                batch_id,
                {
                    key: value
                    for key, value in cls._creation_lifecycle(payload).items()
                    if value is not None
                },
            )
            return cls.get(batch_id)
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get(item_id)
        inventory_keys = {
            "brandId",
            "productId",
            "dosageForm",
            "unitsPerContainer",
            "containerCount",
            "totalUnits",
        }
        if not inventory_keys.intersection(payload):
            return super().update(item_id, payload)

        merged = {**existing, **payload}
        brand = BrandService.get(str(merged["brandId"]))
        product = ProductService.get(str(merged["productId"]))
        units = merged.get("unitsPerContainer")
        containers = int(merged["containerCount"])
        total_units = merged.get("totalUnits")
        if merged["dosageForm"] in UNIT_BASED_FORMS:
            if not units:
                raise ServiceError("unitsPerContainer is required for this dosage form", 400)
            total_units = int(units) * containers
        else:
            total_units = None

        params = {
            "p_batch_id": item_id,
            "p_brand_id": str(merged["brandId"]),
            "p_brand_name": brand["name"],
            "p_brand_code_prefix": brand["codePrefix"],
            "p_batch_code": existing["batchCode"],
            "p_product_id": str(merged["productId"]),
            "p_product_name": product["name"],
            "p_dosage_form": merged["dosageForm"],
            "p_units_per_container": units,
            "p_container_count": containers,
            "p_total_units": total_units,
            "p_notes": merged.get("notes", ""),
            "p_created_by": existing.get("createdBy"),
            "p_start_time": merged.get("startTime"),
            "p_end_time": merged.get("endTime"),
        }
        try:
            cls.client().rpc(
                "update_batch_with_inventory_deduction", to_json_value(params)
            ).execute()
            workflow = {
                key: payload[key]
                for key in (
                    "status",
                    "hasMixing",
                    "hasNJP",
                    "hasAssembly",
                    *BATCH_LIFECYCLE_KEYS,
                )
                if key in payload
            }
            if workflow:
                super().update(item_id, workflow)
            return cls.get(item_id)
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def delete_cascade(cls, item_id: str) -> dict[str, Any]:
        try:
            response = cls.client().rpc("delete_batch_cascade", {"p_batch_id": item_id}).execute()
            result = response.data or {}
            return {
                "success": True,
                "restored": result.get("restored", {}),
                "deleted": result.get("deleted", {"mixing": 0, "njp": 0, "assembly": 0}),
            }
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def delete_safely(cls, item_id: str, *, cascade: bool = False) -> dict[str, Any]:
        batch = cls.get(item_id)
        has_reports = any(
            batch.get(key) for key in ("hasMixing", "hasNJP", "hasAssembly")
        )
        if has_reports and not cascade:
            raise ServiceError(
                "This batch has workflow reports. Retry with cascade=true.",
                409,
            )
        return cls.delete_cascade(item_id)

    @classmethod
    def validate_stock(cls, item_id: str) -> dict[str, Any]:
        batch = cls.get(item_id)
        total_units = batch.get("totalUnits")
        if not total_units:
            return {"hasShortages": False, "shortages": [], "usage": []}

        product = ProductService.get(str(batch["productId"]))
        formula = product.get("rm") or []
        if not formula:
            return {"hasShortages": False, "shortages": [], "usage": []}

        try:
            response = cls.client().table("raw_materials").select("*").execute()
            rows = response.data or []
            by_id = {str(row["id"]): row for row in rows}
            by_code = {str(row.get("code") or "").strip().lower(): row for row in rows}
            by_name = {str(row.get("name") or "").strip().lower(): row for row in rows}
            usage = []
            shortages = []
            for item in formula:
                material = (
                    by_id.get(str(item.get("rawMaterialId") or ""))
                    or by_code.get(str(item.get("rawMaterialCode") or "").strip().lower())
                    or by_name.get(str(item.get("rawMaterial") or "").strip().lower())
                )
                mg_per_unit = cls._formula_mg(item)
                if not material or mg_per_unit <= 0:
                    continue
                required = round(mg_per_unit * int(total_units) / 1_000_000, 4)
                available = float(material.get("qty_kg") or 0)
                record = {
                    "rawMaterialId": str(material["id"]),
                    "rawMaterialCode": material.get("code", ""),
                    "rawMaterialName": material.get("name", ""),
                    "required": required,
                    "available": available,
                }
                usage.append(record)
                if required > available:
                    shortages.append({**record, "shortage": round(required - available, 4)})
            return {"hasShortages": bool(shortages), "shortages": shortages, "usage": usage}
        except Exception as error:
            raise translate_error(error) from error

    @staticmethod
    def _formula_mg(item: dict[str, Any]) -> float:
        import re

        label = str(item.get("labelClaim") or "").lower().replace("µ", "u")
        match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|ug|g)?", label)
        if match:
            value = float(match.group(1))
            unit = match.group(2)
            if unit in {"mcg", "ug"}:
                return value / 1000
            if unit == "g":
                return value * 1000
            return value
        return float(item.get("labelClaimMgPerUnit") or 0)

    @classmethod
    def validate_labels(cls, item_id: str) -> dict[str, Any]:
        batch = cls.get(item_id)
        return LabelService.validate(
            str(batch["brandId"]),
            str(batch["productId"]),
            int(batch["containerCount"]),
        )


class MixingService(TableService):
    table_name = "mixing_reports"

    @classmethod
    def get_by_batch(cls, batch_id: str) -> dict[str, Any]:
        rows = cls.list(filters={"batch_id": batch_id}, limit=1)
        if not rows:
            raise ServiceError("Mixing report not found", 404)
        return rows[0]

    @classmethod
    def create_for_batch(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        batch = BatchService.get(batch_id)
        if batch.get("hasMixing") or batch.get("status") != "mixingPending":
            raise ServiceError("This batch is not in Mixing stage", 409)
        cls._validate_plan(payload)
        params = {
            "p_batch_id": batch_id,
            "p_brand_id": str(batch["brandId"]),
            "p_product_id": str(batch["productId"]),
            "p_rm_usage": payload.get("rmUsage", []),
            "p_non_med_usage": payload.get("nonMedUsage", []),
            "p_mixing_dates": payload.get("mixingDates", []),
            "p_mixing_notes": payload.get("mixingNotes", ""),
            "p_batch_code": batch.get("batchCode"),
            "p_brand_name": batch.get("brandName"),
            "p_product_name": batch.get("productName"),
            "p_mixing_date": payload.get("mixingDate"),
            "p_mixed_powder_name": payload.get("mixedPowderName"),
            "p_mixed_powder_qty_kg": payload.get("mixedPowderQtyKg"),
            "p_total_formula_qty_kg": payload.get("totalFormulaQtyKg"),
            "p_total_mixed_qty_kg": payload.get("totalMixedQtyKg"),
            "p_existing_mixed_powder_used_kg": payload.get("existingMixedPowderUsedKg"),
        }
        try:
            response = cls.client().rpc(
                "create_mixing_report_with_deduction", to_json_value(params)
            ).execute()
            report_id = str(response.data)
            lifecycle = {
                "startDate": _first_value(payload, "startDate", "mixingDate"),
                "startTime": payload.get("startTime"),
                "endDate": _first_value(
                    payload,
                    "endDate",
                    "mixingDate",
                    default=_current_date_ms(),
                ),
                "endTime": payload.get("endTime") or _current_time(),
                "status": "Mixing Completed",
                "remarks": _first_value(payload, "remarks", "mixingNotes"),
                "reason": payload.get("reason"),
            }
            cls.update(
                report_id,
                {key: value for key, value in lifecycle.items() if value is not None},
            )
            BatchService.update(
                batch_id,
                {
                    "batchStatus": "Mixing Completed",
                    "currentStage": "njp",
                    "batchRemarks": _first_value(payload, "remarks", "mixingNotes"),
                    "reason": payload.get("reason"),
                },
            )
            report = cls.get(report_id)
            try:
                from .inventory_service import FinishedGoodsService

                weight = payload.get("totalMixedQtyKg")
                if weight is None:
                    weight = payload.get("totalFormulaQtyKg")
                FinishedGoodsService.create_as_powder(
                    batch_id,
                    weight_kg=float(weight) if weight is not None else None,
                )
            except Exception:
                import logging

                logging.getLogger(__name__).exception(
                    "Mixing saved but finished-goods powder transition failed"
                )
            return report
        except Exception as error:
            raise translate_error(error) from error

    @staticmethod
    def _validate_plan(payload: dict[str, Any]) -> None:
        total_formula = payload.get("totalFormulaQtyKg")
        existing_powder = payload.get("existingMixedPowderUsedKg")
        if existing_powder is None:
            existing_powder = payload.get("mixedPowderQtyKg")
        total_mixed = payload.get("totalMixedQtyKg")
        if total_formula is None:
            return

        total_formula = float(total_formula)
        existing_powder = float(existing_powder or 0)
        if existing_powder < 0:
            raise ServiceError("Existing mixed powder cannot be negative", 400)
        if existing_powder > total_formula:
            raise ServiceError(
                "Existing mixed powder cannot exceed total required formula quantity",
                400,
            )

        expected_total = round(total_formula - existing_powder, 4)
        if total_mixed is not None and abs(float(total_mixed) - expected_total) > 0.0002:
            raise ServiceError(
                "Total mixed quantity must equal total formula quantity minus existing mixed powder",
                400,
            )

        scale = expected_total / total_formula if total_formula > 0 else 0
        formula_rows = [
            *(payload.get("rmUsage") or []),
            *(payload.get("nonMedUsage") or []),
        ]
        declared_formula_total = sum(
            float(row.get("requiredQtyKgFormula") or 0)
            for row in formula_rows
            if row.get("requiredQtyKgFormula") is not None
        )
        if declared_formula_total and abs(declared_formula_total - total_formula) > 0.001:
            raise ServiceError(
                "Total formula quantity does not match the sum of formula rows",
                400,
            )

        for row in formula_rows:
            formula_qty = row.get("requiredQtyKgFormula")
            used_qty = row.get("requiredQtyKgThisMix")
            if formula_qty is not None and used_qty is not None:
                expected_used = round(float(formula_qty) * scale, 4)
                if abs(float(used_qty) - expected_used) > 0.0002:
                    name = (
                        row.get("rawMaterialName")
                        or row.get("name")
                        or "usage row"
                    )
                    raise ServiceError(
                        f"Scaled mixing quantity is incorrect for {name}",
                        400,
                    )
            before = row.get("qtyBeforeKg")
            after = row.get("qtyAfterKg")
            if before is not None and after is not None and used_qty is not None:
                expected_after = round(float(before) - float(used_qty), 4)
                if abs(float(after) - expected_after) > 0.0002:
                    name = (
                        row.get("rawMaterialName")
                        or row.get("name")
                        or "usage row"
                    )
                    raise ServiceError(
                        f"After-mixing stock quantity is incorrect for {name}",
                        400,
                    )

    @classmethod
    def delete_by_batch(cls, batch_id: str) -> dict[str, Any]:
        batch = BatchService.get(batch_id)
        if batch.get("hasNJP") or batch.get("hasAssembly"):
            raise ServiceError(
                "Delete Assembly and NJP reports before deleting Mixing",
                409,
            )
        report = cls.get_by_batch(batch_id)
        try:
            response = cls.client().rpc(
                "delete_mixing_report_with_restore", {"p_report_id": report["id"]}
            ).execute()
            return {"success": True, **(response.data or {})}
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def update_for_batch(
        cls,
        batch_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        report = cls.get_by_batch(batch_id)
        cls._validate_plan(payload)
        allowed = {
            "rmUsage",
            "nonMedUsage",
            "mixingDates",
            "mixingNotes",
            "mixingDate",
            "mixedPowderName",
            "mixedPowderQtyKg",
            "totalFormulaQtyKg",
            "totalMixedQtyKg",
            "existingMixedPowderUsedKg",
            "startTime",
            "endTime",
            "startDate",
            "endDate",
            "status",
            "remarks",
            "reason",
        }
        return cls.update(
            str(report["id"]),
            {key: value for key, value in payload.items() if key in allowed},
        )


class StageReportService(TableService):
    batch_flag = ""
    next_status = ""

    @classmethod
    def get_by_batch(cls, batch_id: str) -> dict[str, Any]:
        rows = cls.list(filters={"batch_id": batch_id}, limit=1)
        if not rows:
            raise ServiceError(f"{cls.table_name} record not found", 404)
        return rows[0]

    @classmethod
    def create_for_batch(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        batch = BatchService.get(batch_id)
        normalized = {
            **payload,
            "batchId": batch_id,
            "brandId": batch["brandId"],
            "productId": batch["productId"],
            "batchCode": batch["batchCode"],
            "brandName": batch["brandName"],
            "productName": batch["productName"],
        }
        report = super().create(normalized)
        BatchService.update(
            batch_id,
            {cls.batch_flag: True, "status": cls.next_status},
        )
        return report

    @classmethod
    def delete_by_batch(cls, batch_id: str) -> None:
        report = cls.get_by_batch(batch_id)
        cls.delete(str(report["id"]))


class NJPService(StageReportService):
    table_name = "njp_reports"
    batch_flag = "hasNJP"
    next_status = "assemblyPending"

    @classmethod
    def _build_payload(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        batch = BatchService.get(batch_id)
        if not batch.get("hasMixing"):
            raise ServiceError("Mixing must be completed before NJP", 409)
        filled = payload.get("totalCapsulesFilledQty")
        rejected = payload.get("rejectedCapsulesQty")
        yield_percent = payload.get("yieldPercent")
        if yield_percent is None and filled is not None and rejected is not None:
            total = int(filled)
            yield_percent = (
                round((total - int(rejected)) / total * 100, 4)
                if total
                else 0
            )
        temperature_c = payload.get("temperatureC")
        temperature_f = payload.get("temperatureF")
        if temperature_f is None and temperature_c is not None:
            temperature_f = round(float(temperature_c) * 9 / 5 + 32, 2)
        load_checks = cls._normalize_load_checks(payload.get("loadChecks") or [])
        capsule_data = payload.get("capsuleData") or {
            key: payload.get(key)
            for key in (
                "lotNumber",
                "capsuleSize",
                "machineModel",
                "machineSpeed",
                "rawMaterialReceivedKg",
                "targetFillWeightMg",
                "totalCapsulesProducedKg",
                "totalCapsulesFilledQty",
                "rejectedCapsulesQty",
                "temperatureC",
                "humidityPercent",
                "dusterCheck",
                "vacuumCheck",
                "startDate",
                "startTime",
                "endDate",
                "endTime",
                "productionDate",
                "status",
                "remarks",
                "reason",
                "operatorName",
            )
        }
        capsule_data.update(
            {
                "temperatureF": temperature_f,
                "yieldPercent": yield_percent,
                "loadChecks": load_checks,
            }
        )
        return {
            "batchId": batch_id,
            "brandId": batch["brandId"],
            "productId": batch["productId"],
            "batchCode": batch["batchCode"],
            "brandName": batch["brandName"],
            "productName": batch["productName"],
            "njpCode": payload.get("njpCode") or batch["batchCode"],
            "lotNumber": payload.get("lotNumber"),
            "capsuleSize": payload.get("capsuleSize"),
            "machineModel": payload.get("machineModel"),
            "machineSpeed": payload.get("machineSpeed"),
            "rawMaterialReceivedKg": payload.get("rawMaterialReceivedKg"),
            "targetFillWeightMg": payload.get("targetFillWeightMg"),
            "totalCapsulesProducedKg": payload.get("totalCapsulesProducedKg"),
            "totalCapsulesFilledQty": filled,
            "rejectedCapsulesQty": rejected,
            "temperatureC": temperature_c,
            "temperatureF": temperature_f,
            "humidityPercent": payload.get("humidityPercent"),
            "dusterCheck": payload.get("dusterCheck", False),
            "vacuumCheck": payload.get("vacuumCheck", False),
            "yieldPercent": yield_percent,
            "startDate": payload.get("startDate"),
            "startTime": payload.get("startTime"),
            "endDate": payload.get("endDate"),
            "endTime": payload.get("endTime"),
            "productionDate": payload.get("productionDate"),
            "status": payload.get("status"),
            "loadChecks": load_checks,
            "remarks": payload.get("remarks"),
            "reason": payload.get("reason"),
            "operatorName": payload.get("operatorName"),
            "capsuleData": capsule_data,
        }

    @staticmethod
    def _normalize_load_checks(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for original in rows:
            row = dict(original)
            weights = []
            for key in ("w1Mg", "w2Mg", "w3Mg", "w4Mg", "w5Mg"):
                value = row.get(key)
                if value not in {None, ""}:
                    weights.append(float(value))
            row["avgWeightMg"] = (
                round(sum(weights) / len(weights), 2) if weights else None
            )
            if any(
                row.get(key) not in {None, ""}
                for key in ("time", "loadLabel", "w1Mg", "w2Mg", "w3Mg", "w4Mg", "w5Mg")
            ):
                normalized.append(row)
        return normalized

    @classmethod
    def create_for_batch(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            cls.get_by_batch(batch_id)
        except ServiceError as error:
            if error.status_code != 404:
                raise
        else:
            raise ServiceError("NJP report already exists for this batch", 409)
        completion_payload = {
            **payload,
            "endDate": _first_value(
                payload,
                "endDate",
                "productionDate",
                "startDate",
                default=_current_date_ms(),
            ),
            "endTime": payload.get("endTime") or _current_time(),
            "status": payload.get("status") or "NJP Completed",
        }
        normalized = cls._build_payload(batch_id, completion_payload)
        report = TableService.create.__func__(cls, normalized)
        BatchService.update(
            batch_id,
            {
                "hasNJP": True,
                "status": cls.next_status,
                "batchStatus": "NJP Completed",
                "currentStage": "assembly",
                "batchRemarks": completion_payload.get("remarks"),
                "reason": completion_payload.get("reason"),
            },
        )
        cls._transition_finished_goods(batch_id, normalized)
        return report

    @classmethod
    def _transition_finished_goods(cls, batch_id: str, normalized: dict[str, Any]) -> None:
        try:
            from .inventory_service import FinishedGoodsService

            FinishedGoodsService.transition_to_capsule(
                batch_id,
                capsule_code=str(normalized["njpCode"] or "") or None,
                capsule_mg=float(normalized["targetFillWeightMg"]) if normalized["targetFillWeightMg"] is not None else None,
                capsule_weight_kg=float(normalized["totalCapsulesProducedKg"]) if normalized["totalCapsulesProducedKg"] is not None else None,
                capsule_amount=int(normalized["totalCapsulesFilledQty"]) if normalized["totalCapsulesFilledQty"] is not None else None,
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "NJP saved but finished-goods capsule transition failed"
            )

    @classmethod
    def update_for_batch(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get_by_batch(batch_id)
        completion_payload = {
            **payload,
            "endDate": _first_value(
                payload,
                "endDate",
                "productionDate",
                "startDate",
                default=_current_date_ms(),
            ),
            "endTime": payload.get("endTime") or _current_time(),
            "status": payload.get("status") or "NJP Completed",
        }
        merged = {**existing, **completion_payload}
        if "capsuleData" not in payload:
            merged.pop("capsuleData", None)
        normalized = cls._build_payload(batch_id, merged)
        report = TableService.update.__func__(cls, str(existing["id"]), normalized)
        BatchService.update(
            batch_id,
            {
                "hasNJP": True,
                "status": cls.next_status,
                "batchStatus": "NJP Completed",
                "currentStage": "assembly",
                "batchRemarks": completion_payload.get("remarks"),
                "reason": completion_payload.get("reason"),
            },
        )
        cls._transition_finished_goods(batch_id, normalized)
        return report

    @classmethod
    def delete_by_batch(cls, batch_id: str) -> None:
        batch = BatchService.get(batch_id)
        if batch.get("hasAssembly"):
            raise ServiceError("Delete Assembly report before deleting NJP", 409)
        super().delete_by_batch(batch_id)
        BatchService.update(batch_id, {"hasNJP": False, "status": "ngpPending"})


class AssemblyService(StageReportService):
    table_name = "assembly_reports"
    batch_flag = "hasAssembly"
    next_status = "finalized"

    @classmethod
    def _build_payload(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        batch = BatchService.get(batch_id)
        if not batch.get("hasMixing") or not batch.get("hasNJP"):
            raise ServiceError(
                "Cannot create Assembly until Mixing and NJP are complete",
                409,
            )
        capsule_weight = payload.get("capsuleWeightMg", payload.get("capsuleWeight"))
        qc_date = payload.get("qualityControlDate", payload.get("qcDate"))
        qc_start = payload.get("qualityControlStartTime", payload.get("qcStartTime"))
        qc_end = payload.get("qualityControlEndTime", payload.get("qcEndTime"))
        packaging_date = payload.get("packagingDate", payload.get("packageDate"))
        packaging_start = payload.get("packagingStartTime", payload.get("startTime"))
        packaging_end = payload.get("packagingEndTime", payload.get("endTime"))
        start_date = _first_value(payload, "startDate", "qualityControlDate", "qcDate", "productionDate")
        start_time = _first_value(payload, "startTime", "qualityControlStartTime", "qcStartTime")
        end_date = _first_value(payload, "endDate", "packagingDate", "packageDate", "productionDate")
        end_time = _first_value(payload, "endTime", "packagingEndTime")
        final_quantities = payload.get("finalQuantities") or {
            "capsuleWeightMg": capsule_weight,
            "filledBottleWeight": payload.get("filledBottleWeight"),
            "capsulesReceivedKg": payload.get("capsulesReceivedKg"),
            "capsulesReceivedQty": payload.get("capsulesReceivedQty"),
            "productionDate": payload.get("productionDate"),
            "expiryDate": payload.get("expiryDate"),
            "startDate": start_date,
            "startTime": start_time,
            "endDate": end_date,
            "endTime": end_time,
            "qualityControlDate": qc_date,
            "qualityControlStartTime": qc_start,
            "qualityControlEndTime": qc_end,
            "packagingDate": packaging_date,
            "packagingStartTime": packaging_start,
            "packagingEndTime": packaging_end,
            "totalBottlesMade": payload.get("totalBottlesMade"),
            "bottleCC": payload.get("bottleCC"),
            "capsulesPerBottle": payload.get("capsulesPerBottle"),
            "receivedCapsuleBucketNumber": payload.get("receivedCapsuleBucketNumber"),
            "receivedCapsulesProductionDate": payload.get("receivedCapsulesProductionDate"),
            "operatorName": payload.get("operatorName"),
            "notes": payload.get("notes"),
            "status": payload.get("status"),
            "remarks": payload.get("remarks"),
            "reason": payload.get("reason"),
        }
        return {
            "batchId": batch_id,
            "brandId": batch["brandId"],
            "productId": batch["productId"],
            "batchCode": batch["batchCode"],
            "brandName": batch["brandName"],
            "productName": batch["productName"],
            "capsuleWeight": capsule_weight,
            "capsuleWeightMg": capsule_weight,
            "filledBottleWeight": payload.get("filledBottleWeight"),
            "capsulesReceivedKg": payload.get("capsulesReceivedKg"),
            "capsulesReceivedQty": payload.get("capsulesReceivedQty"),
            "productionDate": payload.get("productionDate"),
            "expiryDate": payload.get("expiryDate"),
            "startDate": start_date,
            "startTime": start_time,
            "endDate": end_date,
            "endTime": end_time,
            "qualityControlDate": qc_date,
            "qualityControlStartTime": qc_start,
            "qualityControlEndTime": qc_end,
            "packagingDate": packaging_date,
            "packagingStartTime": packaging_start,
            "packagingEndTime": packaging_end,
            "totalBottlesMade": payload.get("totalBottlesMade"),
            "bottleCC": payload.get("bottleCC"),
            "capsulesPerBottle": payload.get("capsulesPerBottle"),
            "receivedCapsuleBucketNumber": payload.get("receivedCapsuleBucketNumber"),
            "receivedCapsulesProductionDate": payload.get("receivedCapsulesProductionDate"),
            "operatorName": payload.get("operatorName"),
            "notes": payload.get("notes"),
            "status": payload.get("status"),
            "remarks": payload.get("remarks"),
            "reason": payload.get("reason"),
            "finalQuantities": final_quantities,
        }

    @classmethod
    def create_for_batch(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            cls.get_by_batch(batch_id)
        except ServiceError as error:
            if error.status_code != 404:
                raise
        else:
            raise ServiceError("Assembly report already exists for this batch", 409)
        completion_payload = {
            **payload,
            "endDate": _first_value(
                payload,
                "endDate",
                "packagingDate",
                "packageDate",
                "productionDate",
                default=_current_date_ms(),
            ),
            "endTime": payload.get("endTime") or payload.get("packagingEndTime") or _current_time(),
            "status": payload.get("status") or "Assembly Completed",
        }
        normalized = cls._build_payload(batch_id, completion_payload)
        report = TableService.create.__func__(cls, normalized)
        BatchService.update(
            batch_id,
            {
                "hasAssembly": True,
                "status": cls.next_status,
                "batchStatus": "Completed",
                "currentStage": "finished_goods",
                "batchEndDate": completion_payload["endDate"],
                "batchEndTime": completion_payload["endTime"],
                "batchRemarks": _first_value(completion_payload, "remarks", "notes"),
                "reason": completion_payload.get("reason"),
            },
        )
        cls._transition_finished_goods(batch_id, completion_payload)
        return report

    @classmethod
    def _transition_finished_goods(cls, batch_id: str, payload: dict[str, Any]) -> None:
        try:
            from .inventory_service import FinishedGoodsService

            FinishedGoodsService.transition_to_bottle(
                batch_id,
                bottle_total=int(payload["totalBottlesMade"]) if payload.get("totalBottlesMade") is not None else None,
                expiry_date=payload.get("expiryDate"),
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Assembly saved but finished-goods bottle transition failed"
            )

    @classmethod
    def update_for_batch(cls, batch_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get_by_batch(batch_id)
        completion_payload = {
            **payload,
            "endDate": _first_value(
                payload,
                "endDate",
                "packagingDate",
                "packageDate",
                "productionDate",
                default=_current_date_ms(),
            ),
            "endTime": payload.get("endTime") or payload.get("packagingEndTime") or _current_time(),
            "status": payload.get("status") or "Assembly Completed",
        }
        merged = {**existing, **completion_payload}
        if "finalQuantities" not in payload:
            merged.pop("finalQuantities", None)
        normalized = cls._build_payload(batch_id, merged)
        report = TableService.update.__func__(cls, str(existing["id"]), normalized)
        BatchService.update(
            batch_id,
            {
                "hasAssembly": True,
                "status": cls.next_status,
                "batchStatus": "Completed",
                "currentStage": "finished_goods",
                "batchEndDate": completion_payload["endDate"],
                "batchEndTime": completion_payload["endTime"],
                "batchRemarks": _first_value(completion_payload, "remarks", "notes"),
                "reason": completion_payload.get("reason"),
            },
        )
        cls._transition_finished_goods(batch_id, completion_payload)
        return report

    @classmethod
    def delete_by_batch(cls, batch_id: str) -> None:
        super().delete_by_batch(batch_id)
        BatchService.update(
            batch_id,
            {"hasAssembly": False, "status": "assemblyPending"},
        )


class StageLifecycleService:
    START_STATUS = {
        "mixing": "In Mixing",
        "njp": "In NJP",
        "assembly": "In Assembly",
    }
    COMPLETED_STATUS = {
        "mixing": "Mixing Completed",
        "njp": "NJP Completed",
        "assembly": "Assembly Completed",
    }
    CURRENT_STAGE_AFTER_COMPLETE = {
        "mixing": "njp",
        "njp": "assembly",
        "assembly": "finished_goods",
    }
    SERVICE = {
        "mixing": MixingService,
        "njp": NJPService,
        "assembly": AssemblyService,
    }

    @classmethod
    def _service(cls, stage: str):
        try:
            return cls.SERVICE[stage]
        except KeyError as error:
            raise ServiceError("Unknown manufacturing stage", 400) from error

    @classmethod
    def _get_existing(cls, service, batch_id: str) -> dict[str, Any] | None:
        try:
            return service.get_by_batch(batch_id)
        except ServiceError as error:
            if error.status_code == 404:
                return None
            raise

    @staticmethod
    def _base_payload(
        batch: dict[str, Any],
        batch_id: str,
        payload: dict[str, Any],
        *,
        status: str,
    ) -> dict[str, Any]:
        remarks = _first_value(payload, "remarks", "reason")
        return {
            "batchId": batch_id,
            "brandId": batch["brandId"],
            "productId": batch["productId"],
            "batchCode": batch["batchCode"],
            "brandName": batch["brandName"],
            "productName": batch["productName"],
            "startDate": _first_value(payload, "startDate", default=_current_date_ms()),
            "startTime": _first_value(payload, "startTime", default=_current_time()),
            "endDate": payload.get("endDate"),
            "endTime": payload.get("endTime"),
            "status": status,
            "remarks": remarks,
            "reason": payload.get("reason"),
        }

    @classmethod
    def _start_payload(
        cls,
        stage: str,
        batch: dict[str, Any],
        batch_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        base = cls._base_payload(
            batch,
            batch_id,
            payload,
            status=cls.START_STATUS[stage],
        )
        if stage == "mixing":
            return {
                **base,
                "rmUsage": [],
                "nonMedUsage": [],
                "mixingDates": [],
                "mixingNotes": base.get("remarks") or "",
            }
        if stage == "njp":
            return NJPService._build_payload(
                batch_id,
                {
                    **base,
                    "njpCode": batch.get("batchCode"),
                    "capsuleData": {
                        "startDate": base["startDate"],
                        "startTime": base["startTime"],
                        "status": base["status"],
                        "remarks": base.get("remarks"),
                        "reason": base.get("reason"),
                    },
                },
            )
        return AssemblyService._build_payload(
            batch_id,
            {
                **base,
                "notes": base.get("remarks"),
                "finalQuantities": {
                    "startDate": base["startDate"],
                    "startTime": base["startTime"],
                    "status": base["status"],
                    "remarks": base.get("remarks"),
                    "reason": base.get("reason"),
                },
            },
        )

    @classmethod
    def start_stage(cls, batch_id: str, stage: str, payload: dict[str, Any]) -> dict[str, Any]:
        service = cls._service(stage)
        batch = BatchService.get(batch_id)

        if stage == "mixing":
            if batch.get("hasMixing") or batch.get("status") != "mixingPending":
                raise ServiceError("This batch is not ready to start Mixing", 409)
        elif stage == "njp":
            if not batch.get("hasMixing"):
                raise ServiceError("Mixing must be completed before NJP", 409)
            if batch.get("hasNJP"):
                raise ServiceError("NJP is already completed for this batch", 409)
        elif stage == "assembly":
            if not batch.get("hasMixing") or not batch.get("hasNJP"):
                raise ServiceError("Mixing and NJP must be completed before Assembly", 409)
            if batch.get("hasAssembly"):
                raise ServiceError("Assembly is already completed for this batch", 409)

        stage_payload = cls._start_payload(stage, batch, batch_id, payload)
        existing = cls._get_existing(service, batch_id)
        if existing:
            report = TableService.update.__func__(
                service,
                str(existing["id"]),
                {key: value for key, value in stage_payload.items() if key != "id"},
            )
        else:
            report = TableService.create.__func__(service, stage_payload)

        batch_update = {
            "batchStatus": cls.START_STATUS[stage],
            "currentStage": stage,
            "batchRemarks": _first_value(payload, "remarks", "reason"),
            "reason": payload.get("reason"),
        }
        if not batch.get("batchStartDate"):
            batch_update["batchStartDate"] = stage_payload.get("startDate")
        if not batch.get("batchStartTime"):
            batch_update["batchStartTime"] = stage_payload.get("startTime")

        BatchService.update(
            batch_id,
            {key: value for key, value in batch_update.items() if value is not None},
        )
        return {"stage": stage, "batch": BatchService.get(batch_id), "report": report}

    @classmethod
    def complete_stage(cls, batch_id: str, stage: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls._service(stage)
        completion_payload = {
            **payload,
            "status": payload.get("status") or cls.COMPLETED_STATUS[stage],
            "endDate": _first_value(
                payload,
                "endDate",
                "mixingDate",
                "productionDate",
                "packagingDate",
                default=_current_date_ms(),
            ),
            "endTime": payload.get("endTime") or _current_time(),
        }

        if stage == "mixing":
            report = MixingService.create_for_batch(batch_id, completion_payload)
        elif stage == "njp":
            if cls._get_existing(NJPService, batch_id):
                report = NJPService.update_for_batch(batch_id, completion_payload)
            else:
                report = NJPService.create_for_batch(batch_id, completion_payload)
        else:
            if cls._get_existing(AssemblyService, batch_id):
                report = AssemblyService.update_for_batch(batch_id, completion_payload)
            else:
                report = AssemblyService.create_for_batch(batch_id, completion_payload)

        batch_status = "Completed" if stage == "assembly" else cls.COMPLETED_STATUS[stage]
        batch_update = {
            "batchStatus": batch_status,
            "currentStage": cls.CURRENT_STAGE_AFTER_COMPLETE[stage],
            "batchRemarks": _first_value(completion_payload, "remarks", "reason", "notes"),
            "reason": completion_payload.get("reason"),
        }
        if stage == "assembly":
            batch_update["batchEndDate"] = completion_payload["endDate"]
            batch_update["batchEndTime"] = completion_payload["endTime"]

        BatchService.update(
            batch_id,
            {key: value for key, value in batch_update.items() if value is not None},
        )
        return {"stage": stage, "batch": BatchService.get(batch_id), "report": report}
