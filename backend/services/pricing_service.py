from __future__ import annotations

from typing import Any

from .base_service import ServiceError, translate_error
from .batch_service import BatchService
from .catalog_service import ProductService


class BatchPricingService:
    """Server-owned version of the original Batch Pricing calculator."""

    DEFAULTS = {
        "capsPricePer75000": 1000,
        "bottleUnitCost": 0.5,
        "lidUnitCost": 0.1,
        "labelUnitCost": 0.15,
        "labourCost": 0,
    }

    @classmethod
    def calculate(
        cls,
        batch_id: str,
        inputs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        values = {**cls.DEFAULTS, **(inputs or {})}
        batch = BatchService.get(batch_id)
        product = ProductService.get(str(batch["productId"]))

        quantity = cls._nonnegative(
            values.get("quantity", batch.get("containerCount") or 0),
            "Quantity",
        )
        caps_per_bottle = cls._nonnegative(
            values.get("capsPerBottle", batch.get("unitsPerContainer") or 0),
            "Capsules per bottle",
        )
        total_capsules = quantity * caps_per_bottle

        formula = product.get("rm") or []
        material_rows = cls._raw_material_lookup()
        price_overrides = values.get("rawMaterialPrices") or {}
        lines = []
        for index, item in enumerate(formula):
            material = cls._resolve_material(item, material_rows)
            mg_per_capsule = BatchService._formula_mg(item)
            total_weight_kg = mg_per_capsule * total_capsules / 1_000_000
            material_id = str(
                item.get("rawMaterialId")
                or (material or {}).get("id")
                or ""
            )
            override = price_overrides.get(material_id)
            if override is None:
                override = price_overrides.get(str(item.get("rawMaterialCode") or ""))
            price_per_kg = cls._nonnegative(
                override
                if override is not None
                else (material or {}).get("price_per_kg", 0),
                "Raw-material price",
            )
            cost = total_weight_kg * price_per_kg
            lines.append(
                {
                    "sr": index + 1,
                    "rawMaterialId": material_id or None,
                    "rawMaterialCode": item.get("rawMaterialCode")
                    or (material or {}).get("code"),
                    "rawMaterialName": item.get("rawMaterial")
                    or (material or {}).get("name"),
                    "labelClaim": item.get("labelClaim"),
                    "labelClaimMgPerUnit": mg_per_capsule,
                    "computedWeightKg": round(total_weight_kg, 6),
                    "pricePerKg": round(price_per_kg, 4),
                    "cost": round(cost, 4),
                }
            )

        raw_material_cost = sum(line["cost"] for line in lines)
        caps_price = cls._nonnegative(
            values["capsPricePer75000"],
            "Capsule price per 75,000",
        )
        bottle_unit = cls._nonnegative(values["bottleUnitCost"], "Bottle unit cost")
        lid_unit = cls._nonnegative(values["lidUnitCost"], "Lid unit cost")
        label_unit = cls._nonnegative(values["labelUnitCost"], "Label unit cost")
        labour = cls._nonnegative(values["labourCost"], "Labour cost")

        capsule_cost = caps_price / 75_000 * total_capsules
        bottle_cost = bottle_unit * quantity
        lid_cost = lid_unit * quantity
        label_cost = label_unit * quantity
        packaging_cost = capsule_cost + bottle_cost + lid_cost + label_cost
        grand_total = raw_material_cost + packaging_cost + labour

        cad_rate = values.get("cadRate")
        cad_rate = (
            cls._nonnegative(cad_rate, "CAD rate")
            if cad_rate not in {None, ""}
            else None
        )
        return {
            "batch": batch,
            "product": product,
            "quantity": quantity,
            "capsPerBottle": caps_per_bottle,
            "totalCapsulesNeeded": total_capsules,
            "pricingLines": lines,
            "rawMaterialCost": round(raw_material_cost, 4),
            "capsuleCost": round(capsule_cost, 4),
            "bottleCost": round(bottle_cost, 4),
            "lidCost": round(lid_cost, 4),
            "labelCost": round(label_cost, 4),
            "packagingCost": round(packaging_cost, 4),
            "labourCost": round(labour, 4),
            "grandTotal": round(grand_total, 4),
            "costPerBottle": round(grand_total / quantity, 4) if quantity else 0,
            "cadRate": cad_rate,
            "grandTotalCAD": round(grand_total * cad_rate, 4)
            if cad_rate is not None
            else None,
        }

    @staticmethod
    def _nonnegative(value: Any, label: str) -> float:
        try:
            number = float(value or 0)
        except (TypeError, ValueError) as error:
            raise ServiceError(f"{label} must be a number", 400) from error
        if number < 0:
            raise ServiceError(f"{label} cannot be negative", 400)
        return number

    @staticmethod
    def _raw_material_lookup() -> dict[str, dict[str, Any]]:
        try:
            rows = (
                BatchService.client()
                .table("raw_materials")
                .select("id, code, name, price_per_kg")
                .execute()
                .data
                or []
            )
        except Exception as error:
            raise translate_error(error) from error
        lookup: dict[str, dict[str, Any]] = {}
        for row in rows:
            lookup[f"id:{row['id']}"] = row
            lookup[f"code:{str(row.get('code') or '').strip().lower()}"] = row
            lookup[f"name:{str(row.get('name') or '').strip().lower()}"] = row
        return lookup

    @staticmethod
    def _resolve_material(
        item: dict[str, Any],
        lookup: dict[str, dict[str, Any]],
    ) -> dict[str, Any] | None:
        return (
            lookup.get(f"id:{item.get('rawMaterialId')}")
            or lookup.get(
                f"code:{str(item.get('rawMaterialCode') or '').strip().lower()}"
            )
            or lookup.get(
                f"name:{str(item.get('rawMaterial') or '').strip().lower()}"
            )
        )
