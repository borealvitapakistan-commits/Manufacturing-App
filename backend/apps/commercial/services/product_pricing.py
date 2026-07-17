from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import urlopen

from apps.inventory.services.raw_materials import RawMaterialService
from apps.commercial.services.products import ProductService
from services.base_service import ServiceError, translate_error


class ProductPricingService:
    """Server-owned product price calculator."""

    DEFAULTS = {
        "capsPricePer75000": 1000,
        "bottleUnitCost": 0.5,
        "lidUnitCost": 0.1,
        "labelUnitCost": 0.15,
        "labourCost": 0,
    }

    CAD_RATE_SOURCES = (
        ("frankfurter.app", "https://api.frankfurter.app/latest?from=USD&to=CAD"),
        ("open.er-api.com", "https://open.er-api.com/v6/latest/USD"),
    )

    @classmethod
    def current_cad_rate(cls) -> dict[str, Any]:
        errors = []
        for source, url in cls.CAD_RATE_SOURCES:
            try:
                with urlopen(url, timeout=8) as response:
                    payload = json.loads(response.read().decode("utf-8") or "{}")
                rate = cls._parse_cad_rate(source, payload)
                if rate <= 0:
                    raise ValueError("CAD rate must be greater than zero")
                return {
                    "base": "USD",
                    "target": "CAD",
                    "rate": round(rate, 6),
                    "date": payload.get("date") or payload.get("time_last_update_utc"),
                    "source": source,
                }
            except Exception as error:
                errors.append(f"{source}: {error}")
        raise ServiceError(
            "Could not fetch CAD exchange rate. You can enter it manually.",
            502,
            {"sources": errors},
        )

    @classmethod
    def calculate_for_product(
        cls,
        product_id: str,
        inputs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        values = {**cls.DEFAULTS, **(inputs or {})}
        product = ProductService.get(product_id)

        units_per_container = cls._nonnegative(
            values.get("unitsPerContainer", values.get("capsPerBottle", 0)),
            "Units per container",
        )
        container_count = cls._nonnegative(
            values.get("containerCount", values.get("quantity", 0)),
            "Container count",
        )
        total_units = units_per_container * container_count

        lines = cls._formula_lines(product, total_units, values.get("rawMaterialPrices") or {})
        raw_material_cost = sum(line["cost"] for line in lines)

        caps_price = cls._nonnegative(
            values["capsPricePer75000"],
            "Capsule price per 75,000",
        )
        bottle_unit = cls._nonnegative(values["bottleUnitCost"], "Bottle unit cost")
        lid_unit = cls._nonnegative(values["lidUnitCost"], "Lid unit cost")
        label_unit = cls._nonnegative(values["labelUnitCost"], "Label unit cost")

        capsule_cost = caps_price / 75_000 * total_units
        bottle_cost = bottle_unit * container_count
        lid_cost = lid_unit * container_count
        label_cost = label_unit * container_count
        packaging_cost = capsule_cost + bottle_cost + lid_cost + label_cost
        grand_total = raw_material_cost + packaging_cost

        cad_rate = values.get("cadRate")
        cad_rate = (
            cls._nonnegative(cad_rate, "CAD rate")
            if cad_rate not in {None, ""}
            else None
        )

        return {
            "product": product,
            "unitsPerContainer": units_per_container,
            "containerCount": container_count,
            "totalUnits": total_units,
            "pricingLines": lines,
            "rawMaterialCost": round(raw_material_cost, 4),
            "capsuleCost": round(capsule_cost, 4),
            "bottleCost": round(bottle_cost, 4),
            "lidCost": round(lid_cost, 4),
            "labelCost": round(label_cost, 4),
            "packagingCost": round(packaging_cost, 4),
            "grandTotal": round(grand_total, 4),
            "costPerContainer": round(grand_total / container_count, 4) if container_count else 0,
            "cadRate": cad_rate,
            "grandTotalCAD": round(grand_total * cad_rate, 4)
            if cad_rate is not None
            else None,
        }

    @classmethod
    def _formula_lines(
        cls,
        product: dict[str, Any],
        total_units: float,
        price_overrides: dict[str, Any],
    ) -> list[dict[str, Any]]:
        formula = product.get("rm") or []
        material_rows = cls._raw_material_lookup()
        lines = []
        for index, item in enumerate(formula):
            material = cls._resolve_material(item, material_rows)
            mg_per_unit = cls._formula_mg(item)
            required_kg = mg_per_unit * total_units / 1_000_000
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
                else (
                    (material or {}).get("price_per_kg")
                    if (material or {}).get("price_per_kg") is not None
                    else (material or {}).get("pricePerKg", 0)
                ),
                "Raw-material price",
            )
            cost = required_kg * price_per_kg
            lines.append(
                {
                    "sr": index + 1,
                    "rawMaterialId": material_id or None,
                    "rawMaterialCode": item.get("rawMaterialCode")
                    or (material or {}).get("code"),
                    "rawMaterialName": item.get("rawMaterial")
                    or (material or {}).get("name"),
                    "labelClaim": item.get("labelClaim"),
                    "labelClaimMgPerUnit": mg_per_unit,
                    "computedWeightKg": round(required_kg, 6),
                    "requiredKg": round(required_kg, 6),
                    "pricePerKg": round(price_per_kg, 4),
                    "cost": round(cost, 4),
                }
            )
        return lines

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
    def _parse_cad_rate(source: str, payload: dict[str, Any]) -> float:
        rates = payload.get("rates") or {}
        if source == "open.er-api.com" and payload.get("result") not in {None, "success"}:
            raise ValueError(payload.get("error-type") or "currency API failed")
        value = rates.get("CAD")
        if value is None:
            raise ValueError("CAD rate missing from response")
        return float(value)

    @staticmethod
    def _raw_material_lookup() -> dict[str, dict[str, Any]]:
        try:
            rows = RawMaterialService.list(limit=2000)
        except Exception as error:
            raise translate_error(error) from error
        lookup: dict[str, dict[str, Any]] = {}
        for row in rows:
            lookup[f"id:{row['id']}"] = row
            lookup[f"code:{str(row.get('code') or '').strip().lower()}"] = row
            lookup[f"name:{str(row.get('name') or '').strip().lower()}"] = row
        return lookup

    @staticmethod
    def _formula_mg(item: dict[str, Any]) -> float:
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
