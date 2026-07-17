from __future__ import annotations

import re
from typing import Any

from services import db
from services.base_service import ServiceError, TableService

DB_PRODUCT_TYPES = {
    "capsule",
    "tablet",
    "tablets",
    "softgel",
    "liquid",
    "lozenge",
    "lozengers",
    "powder",
}
PRODUCT_TYPE_ALIASES = {
    "capsule": "capsule",
    "capsules": "capsule",
    "tablet": "tablets",
    "tablets": "tablets",
    "softgel": "softgel",
    "softgels": "softgel",
    "liquid": "liquid",
    "lozenger": "lozengers",
    "lozengers": "lozengers",
    "lozenge": "lozengers",
    "lozenges": "lozengers",
    "powder": "powder",
}


def _normalize_product_type(value: Any) -> str:
    text = str(value or "capsule").strip().lower()
    normalized = PRODUCT_TYPE_ALIASES.get(text)
    if not normalized:
        raise ServiceError("Invalid product type", 400)
    return normalized


class ProductService(TableService):
    table_name = "products"

    @classmethod
    def list(cls, **kwargs):
        return cls._db_list(**kwargs)

    @staticmethod
    def parse_label_claim(label: str) -> float | None:
        normalized_label = (
            str(label or "")
            .lower()
            .replace("\u00c3\u201a", "")
            .replace("\u00c2", "")
            .replace("\u00b5", "u")
            .replace("\u03bc", "u")
        )
        normalized_label = re.sub(r"[^0-9a-z.\s]", "", normalized_label)
        match = re.search(
            r"([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|Âµg|ug|g)?",
            normalized_label,
        )
        if not match:
            return None

        value = float(match.group(1))
        unit = match.group(2)
        if unit in {"mcg", "Âµg", "ug"}:
            return value / 1000
        if unit == "g":
            return value * 1000
        return value

    @classmethod
    def process_raw_materials(cls, rm_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return cls.process_raw_materials_db(rm_list)

    @classmethod
    def process_raw_materials_db(cls, rm_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
        processed: list[dict[str, Any]] = []
        for index, raw_row in enumerate(rm_list, start=1):
            row = dict(raw_row)
            raw_material_id = row.get("rawMaterialId")
            if not raw_material_id:
                raise ServiceError("Select a valid raw material for every formula row", 400)

            item = db.one(
                db.execute(
                    db.client()
                    .table("inventory_items")
                    .select("id, item_code, item_name")
                    .eq("id", str(raw_material_id))
                    .eq("item_kind", "raw_material")
                    .limit(1)
                )
            )
            if not item:
                raise ServiceError("Selected raw material was not found", 400)

            parsed_claim = cls.parse_label_claim(str(row.get("labelClaim") or ""))
            label_claim_mg = parsed_claim if parsed_claim else float(row.get("labelClaimMgPerUnit") or 0)
            if label_claim_mg <= 0:
                raise ServiceError("Label claim MG is required for every formula row", 400)

            processed.append(
                {
                    **row,
                    "sr": int(row.get("sr") or index),
                    "rawMaterialId": str(item["id"]),
                    "rawMaterialCode": item.get("item_code"),
                    "rawMaterial": item.get("item_name"),
                    "labelClaim": row.get("labelClaim") or f"{label_claim_mg:g} mg",
                    "labelClaimMgPerUnit": label_claim_mg,
                }
            )
        return processed

    @classmethod
    def normalize_payload(cls, payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)
        if "type" in normalized:
            normalized["type"] = _normalize_product_type(normalized.get("type"))
            if normalized["type"] not in DB_PRODUCT_TYPES:
                raise ServiceError("Invalid product type", 400)
        elif not partial:
            normalized["type"] = "capsule"
        if "npn" in normalized:
            normalized["npn"] = str(normalized["npn"] or "").strip() or None
        if "rm" in normalized:
            normalized["rm"] = cls.process_raw_materials(normalized["rm"])
        return normalized

    @classmethod
    def _db_existing_product(cls, field_name: str, value: Any) -> dict[str, Any] | None:
        clean_value = str(value or "").strip()
        if not clean_value:
            return None
        return db.one(
            db.execute(
                db.client()
                .table("products")
                .select("id, product_name, product_code, npn")
                .eq(field_name, clean_value)
                .limit(1)
            )
        )

    @classmethod
    def _db_validate_unique_fields(
        cls,
        normalized: dict[str, Any],
        *,
        exclude_id: str | None = None,
    ) -> None:
        checks = (
            ("npn", "NPN"),
            ("productCode", "product code"),
        )
        for payload_key, label in checks:
            if payload_key not in normalized:
                continue
            value = normalized.get(payload_key)
            if not value:
                continue
            db_field = "product_code" if payload_key == "productCode" else payload_key
            existing = cls._db_existing_product(db_field, value)
            if existing and str(existing.get("id")) != str(exclude_id or ""):
                raise ServiceError(
                    f'A product with this {label} already exists: {value}.',
                    409,
                )

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload)
        return cls._db_create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload, partial=True)
        return cls._db_update(item_id, normalized)

    @classmethod
    def delete(cls, item_id: str) -> None:
        if db.one(
            db.execute(
                db.client().table("mixings").select("id").eq("product_id", item_id).limit(1)
            )
        ):
            raise ServiceError(
                "Cannot delete product with existing manufacturing records",
                409,
            )
        db.execute(db.client().table("product_formula_items").delete().eq("product_id", item_id))
        db.execute(db.client().table("products").delete().eq("id", item_id))
        return None

    @classmethod
    def get_by_raw_material(cls, raw_material_id: str) -> list[dict[str, Any]]:
        formula_rows = db.data(
            db.execute(
                db.client()
                .table("product_formula_items")
                .select("product_id")
                .eq("raw_material_id", raw_material_id)
            )
        )
        ids = {str(row.get("product_id")) for row in formula_rows}
        return [product for product in cls.list(limit=500) if str(product.get("id")) in ids]

    @classmethod
    def get(cls, item_id: str):
        row = db.require_row(
            db.one(
                db.execute(
                    db.client().table("products").select("*").eq("id", item_id).limit(1)
                )
            ),
            "Product not found",
        )
        return cls._db_to_app(row)

    @classmethod
    def _db_list(cls, **kwargs) -> list[dict[str, Any]]:
        limit = max(1, min(int(kwargs.get("limit") or 500), 1000))
        rows = db.data(
            db.execute(
                db.client()
                .table("products")
                .select("*")
                .order("product_name")
                .limit(limit)
            )
        )
        return [cls._db_to_app(row) for row in rows]

    @classmethod
    def _db_to_app(cls, row: dict[str, Any]) -> dict[str, Any]:
        product_id = str(row["id"])
        formula_rows = db.data(
            db.execute(
                db.client()
                .table("product_formula_items")
                .select("*")
                .eq("product_id", product_id)
                .order("sort_order")
            )
        )
        raw_ids = [str(item.get("raw_material_id")) for item in formula_rows if item.get("raw_material_id")]
        raw_lookup: dict[str, dict[str, Any]] = {}
        for raw_id in raw_ids:
            raw_item = db.one(
                db.execute(
                    db.client()
                    .table("inventory_items")
                    .select("id, item_code, item_name")
                    .eq("id", raw_id)
                    .limit(1)
                )
            )
            if raw_item:
                raw_lookup[str(raw_item["id"])] = raw_item

        formula = []
        for index, item in enumerate(formula_rows, start=1):
            raw = raw_lookup.get(str(item.get("raw_material_id"))) or {}
            claim = db.as_float(item.get("label_claim_mg"))
            formula.append(
                {
                    "sr": index,
                    "rawMaterialId": str(item.get("raw_material_id")) if item.get("raw_material_id") else "",
                    "rawMaterialCode": raw.get("item_code"),
                    "rawMaterial": raw.get("item_name"),
                    "labelClaim": f"{claim:g} mg",
                    "labelClaimMgPerUnit": claim,
                    "categoryId": None,
                }
            )

        return {
            "id": product_id,
            "name": row.get("product_name"),
            "productName": row.get("product_name"),
            "productCode": row.get("product_code"),
            "type": row.get("product_type"),
            "npn": row.get("npn"),
            "rm": formula,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }

    @classmethod
    def _db_create(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        cls._db_validate_unique_fields(normalized)
        created = db.one(
            db.execute(
                db.client()
                .table("products")
                .insert(
                    {
                        "product_name": normalized.get("name") or normalized.get("productName"),
                        "product_code": normalized.get("productCode"),
                        "product_type": normalized.get("type") or "capsule",
                        "npn": normalized.get("npn"),
                        "notes": normalized.get("notes"),
                    }
                )
            )
        )
        product = db.require_row(created, "Product was not saved", 500)
        cls._db_replace_formula(str(product["id"]), normalized.get("rm") or [])
        return cls.get(str(product["id"]))

    @classmethod
    def _db_update(cls, item_id: str, normalized: dict[str, Any]) -> dict[str, Any]:
        cls._db_validate_unique_fields(normalized, exclude_id=item_id)
        update_payload = {}
        if "name" in normalized or "productName" in normalized:
            update_payload["product_name"] = normalized.get("name") or normalized.get("productName")
        if "productCode" in normalized:
            update_payload["product_code"] = normalized.get("productCode")
        if "type" in normalized:
            update_payload["product_type"] = normalized.get("type")
        if "npn" in normalized:
            update_payload["npn"] = normalized.get("npn")
        if "notes" in normalized:
            update_payload["notes"] = normalized.get("notes")
        if update_payload:
            db.execute(db.client().table("products").update(update_payload).eq("id", item_id))
        if "rm" in normalized:
            cls._db_replace_formula(item_id, normalized.get("rm") or [])
        return cls.get(item_id)

    @classmethod
    def _db_replace_formula(cls, product_id: str, formula: list[dict[str, Any]]) -> None:
        db.execute(
            db.client().table("product_formula_items").delete().eq("product_id", product_id)
        )
        rows = []
        for index, row in enumerate(formula, start=1):
            raw_material_id = row.get("rawMaterialId")
            if not raw_material_id:
                continue
            rows.append(
                {
                    "product_id": product_id,
                    "raw_material_id": str(raw_material_id),
                    "label_claim_mg": db.decimal_str(row.get("labelClaimMgPerUnit")),
                    "sort_order": int(row.get("sr") or index),
                    "remarks": row.get("remarks"),
                    "metadata": db.json_safe(row),
                }
            )
        if rows:
            db.execute(db.client().table("product_formula_items").insert(rows))


__all__ = ["ProductService"]
