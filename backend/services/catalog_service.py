from __future__ import annotations

import re
from typing import Any

from .base_service import ServiceError, TableService, translate_error
from .converters import row_to_app, rows_to_app


class BrandService(TableService):
    table_name = "brands"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "name")
        kwargs.setdefault("descending", False)
        return super().list(**kwargs)

    @staticmethod
    def normalize_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)
        for key in ("name", "codePrefix"):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip()
                if not normalized[key]:
                    raise ServiceError(
                        "Brand name is required" if key == "name" else "Code prefix is required",
                        400,
                    )
            elif not partial:
                raise ServiceError(
                    "Brand name is required" if key == "name" else "Code prefix is required",
                    400,
                )
        for key in (
            "shortName",
            "addressLine1",
            "addressLine2",
            "city",
            "province",
            "country",
            "phone",
            "notes",
            "logoUrl",
        ):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None
        if "color" in normalized:
            normalized["color"] = str(normalized["color"] or "").strip() or "#16a34a"
        elif not partial:
            normalized["color"] = "#16a34a"
        if not partial:
            normalized.setdefault("isActive", True)
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        return super().create(cls.normalize_payload(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls.get(item_id)
        return super().update(item_id, cls.normalize_payload(payload, partial=True))

    @classmethod
    def delete(cls, item_id: str) -> None:
        try:
            response = (
                cls.client()
                .table("batches")
                .select("id")
                .eq("brand_id", item_id)
                .limit(1)
                .execute()
            )
        except Exception as error:
            raise translate_error(error) from error
        if response.data:
            raise ServiceError("Cannot delete brand with existing batches", 409)
        super().delete(item_id)

    @classmethod
    def toggle_active(cls, item_id: str) -> dict[str, Any]:
        existing = cls.get(item_id)
        return cls.update(item_id, {"isActive": not existing.get("isActive", True)})


class ProductService(TableService):
    table_name = "products"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "name")
        kwargs.setdefault("descending", False)
        return super().list(**kwargs)

    @staticmethod
    def parse_label_claim(label: str) -> float | None:
        match = re.search(
            r"([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|µg|ug|g)?",
            str(label or "").lower(),
        )
        if not match:
            return None

        value = float(match.group(1))
        unit = match.group(2)
        if unit in {"mcg", "µg", "ug"}:
            return value / 1000
        if unit == "g":
            return value * 1000
        return value

    @classmethod
    def process_raw_materials(cls, rm_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
        processed: list[dict[str, Any]] = []

        for raw_row in rm_list:
            row = dict(raw_row)
            raw_material_id = row.get("rawMaterialId")
            raw_material_code = row.get("rawMaterialCode")

            if raw_material_id:
                try:
                    response = (
                        cls.client()
                        .table("raw_materials")
                        .select("id, code, name")
                        .eq("id", str(raw_material_id))
                        .limit(1)
                        .execute()
                    )
                except Exception as error:
                    raise translate_error(error) from error
                if not response.data:
                    raise ServiceError("Selected raw material was not found", 400)
                material = response.data[0]
                raw_material_id = material.get("id")
                raw_material_code = material.get("code")
                row["rawMaterial"] = material.get("name")
            elif row.get("rawMaterial"):
                try:
                    response = (
                        cls.client()
                        .table("raw_materials")
                        .select("id, code, name")
                        .eq("name", row["rawMaterial"])
                        .limit(1)
                        .execute()
                    )
                except Exception as error:
                    raise translate_error(error) from error

                if response.data:
                    raw_material_id = response.data[0].get("id")
                    raw_material_code = response.data[0].get("code")
                    row["rawMaterial"] = response.data[0].get("name")

            if not raw_material_id:
                raise ServiceError("Select a valid raw material for every formula row", 400)

            parsed_claim = cls.parse_label_claim(str(row.get("labelClaim") or ""))
            row["rawMaterialId"] = str(raw_material_id) if raw_material_id else None
            row["rawMaterialCode"] = raw_material_code or None
            row["labelClaimMgPerUnit"] = (
                parsed_claim
                if parsed_claim
                else float(row.get("labelClaimMgPerUnit") or 0)
            )
            processed.append(row)

        return processed

    @classmethod
    def normalize_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        if "npn" in normalized:
            normalized["npn"] = str(normalized["npn"] or "").strip() or None
        if "rm" in normalized:
            normalized["rm"] = cls.process_raw_materials(normalized["rm"])
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        return super().create(cls.normalize_payload(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return super().update(item_id, cls.normalize_payload(payload))

    @classmethod
    def delete(cls, item_id: str) -> None:
        try:
            response = (
                cls.client()
                .table("batches")
                .select("id")
                .eq("product_id", item_id)
                .limit(1)
                .execute()
            )
        except Exception as error:
            raise translate_error(error) from error

        if response.data:
            raise ServiceError("Cannot delete product with existing batches", 409)
        super().delete(item_id)

    @classmethod
    def get_by_raw_material(cls, raw_material_id: str) -> list[dict[str, Any]]:
        return [
            product
            for product in cls.list(limit=500)
            if any(
                str(item.get("rawMaterialId") or "") == raw_material_id
                for item in (product.get("rm") or [])
            )
        ]


class RawMaterialService(TableService):
    table_name = "raw_materials"

    @classmethod
    def next_code(cls) -> str:
        try:
            response = (
                cls.client().table(cls.table_name).select("code").order("code", desc=True).limit(50).execute()
            )
            highest = 0
            for row in response.data or []:
                code = str(row.get("code") or "")
                if code.upper().startswith("RM") and code[2:].isdigit():
                    highest = max(highest, int(code[2:]))
            return f"RM{highest + 1:03d}"
        except Exception as error:
            raise translate_error(error) from error

    @staticmethod
    def code_from_name(name: str) -> str:
        parts = [part[:3].upper() for part in name.split() if part]
        return f"RM-{'-'.join(parts)[:12]}" if parts else "RM"

    @staticmethod
    def with_qty_alias(item: dict[str, Any]) -> dict[str, Any]:
        return {**item, "qty": item.get("qtyKg", 0)}

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "name")
        kwargs.setdefault("descending", False)
        return [cls.with_qty_alias(item) for item in super().list(**kwargs)]

    @classmethod
    def get(cls, item_id: str):
        return cls.with_qty_alias(super().get(item_id))

    @classmethod
    def normalize_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        if "qty" in normalized and "qtyKg" not in normalized:
            normalized["qtyKg"] = normalized.pop("qty")
        if "name" in normalized:
            normalized["name"] = str(normalized["name"] or "").strip()
            if not normalized["name"]:
                raise ServiceError("Material name is required", 400)
        for key in ("code", "category", "location", "coaLink", "comments"):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload)
        normalized["code"] = normalized.get("code") or cls.code_from_name(
            str(normalized.get("name", ""))
        )
        normalized.setdefault("qtyKg", 0)
        normalized.setdefault("pricePerKg", 0)
        return cls.with_qty_alias(super().create(normalized))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return cls.with_qty_alias(super().update(item_id, cls.normalize_payload(payload)))

    @classmethod
    def search(cls, query_text: str, limit: int = 100) -> list[dict[str, Any]]:
        try:
            safe_query = query_text.replace(",", " ")
            response = (
                cls.client()
                .table(cls.table_name)
                .select("*")
                .or_(f"code.ilike.%{safe_query}%,name.ilike.%{safe_query}%")
                .order("name")
                .limit(max(1, min(limit, 500)))
                .execute()
            )
            return [cls.with_qty_alias(item) for item in rows_to_app(response.data)]
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def low_stock(cls, threshold: float) -> list[dict[str, Any]]:
        try:
            response = (
                cls.client()
                .table(cls.table_name)
                .select("*")
                .lte("qty_kg", threshold)
                .order("qty_kg")
                .execute()
            )
            from .converters import rows_to_app

            return [cls.with_qty_alias(item) for item in rows_to_app(response.data)]
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def adjust_stock(cls, item_id: str, adjustment: float) -> dict[str, Any]:
        current = cls.get(item_id)
        new_quantity = round(float(current.get("qtyKg", 0)) + adjustment, 4)
        if new_quantity < 0:
            raise ServiceError("Stock adjustment would make quantity negative", 400)
        return cls.update(item_id, {"qtyKg": new_quantity})

    @classmethod
    def update_stock(cls, item_id: str, new_quantity: float) -> dict[str, Any]:
        if new_quantity < 0:
            raise ServiceError("Stock cannot go below zero", 400)
        return cls.update(item_id, {"qtyKg": round(new_quantity, 4)})

    @classmethod
    def get_by_code(cls, code: str) -> dict[str, Any] | None:
        try:
            response = (
                cls.client()
                .table(cls.table_name)
                .select("*")
                .eq("code", code)
                .limit(1)
                .execute()
            )
            if not response.data:
                return None
            return cls.with_qty_alias(row_to_app(response.data[0]) or {})
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def delete(cls, item_id: str) -> None:
        try:
            response = cls.client().table("products").select("id, rm").execute()
        except Exception as error:
            raise translate_error(error) from error
        for product in response.data or []:
            formula = product.get("rm") or []
            if any(str(item.get("rawMaterialId") or "") == item_id for item in formula):
                raise ServiceError("Cannot delete raw material used in products", 409)
        super().delete(item_id)


class LabelService(TableService):
    table_name = "label_inventory"

    @classmethod
    def list(
        cls,
        *,
        filters: dict[str, Any] | None = None,
        limit: int = 100,
        **kwargs,
    ):
        try:
            query = cls.client().table(cls.table_name).select("*")
            for key, value in (filters or {}).items():
                if value is not None and value != "":
                    query = query.eq(key, value)
            response = (
                query.order("brand_name")
                .order("product_name")
                .order("label_name")
                .limit(max(1, min(limit, 500)))
                .execute()
            )
            return rows_to_app(response.data)
        except Exception as error:
            raise translate_error(error) from error

    @staticmethod
    def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        if "labelName" in normalized:
            normalized["labelName"] = (
                str(normalized["labelName"] or "").strip() or "Standard Label"
            )
        if "notes" in normalized:
            normalized["notes"] = str(normalized["notes"] or "").strip() or None
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload)
        brand = BrandService.get(str(normalized["brandId"]))
        product = ProductService.get(str(normalized["productId"]))
        normalized["brandName"] = brand["name"]
        normalized["productName"] = product["name"]
        normalized.setdefault("labelName", "Standard Label")
        return super().create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls.get(item_id)
        normalized = cls.normalize_payload(payload)
        if "brandId" in normalized:
            normalized["brandName"] = BrandService.get(str(normalized["brandId"]))["name"]
        if "productId" in normalized:
            normalized["productName"] = ProductService.get(str(normalized["productId"]))["name"]
        return super().update(item_id, normalized)

    @classmethod
    def validate(cls, brand_id: str, product_id: str, required: int) -> dict[str, Any]:
        try:
            response = (
                cls.client()
                .table(cls.table_name)
                .select("*")
                .eq("brand_id", brand_id)
                .eq("product_id", product_id)
                .eq("is_active", True)
                .execute()
            )
            available = sum(max(0, int(row.get("quantity") or 0)) for row in (response.data or []))
            shortage = max(required - available, 0)
            return {
                "hasShortage": shortage > 0,
                "required": required,
                "available": available,
                "shortage": shortage,
            }
        except Exception as error:
            raise translate_error(error) from error
