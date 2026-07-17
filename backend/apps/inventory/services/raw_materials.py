from __future__ import annotations

from typing import Any

from services import db
from services.base_service import ServiceError, TableService, translate_error


class RawMaterialService(TableService):
    table_name = "raw_materials"

    @classmethod
    def next_code(cls) -> str:
        try:
            response = (
                db.client()
                .table("inventory_items")
                .select("item_code")
                .eq("item_kind", "raw_material")
                .order("item_code", desc=True)
                .limit(50)
                .execute()
            )
            highest = 0
            for row in response.data or []:
                code = str(row.get("item_code") or "")
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
        return cls._db_list(**kwargs)

    @classmethod
    def get(cls, item_id: str):
        return cls._db_get(item_id)

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
        if "categoryId" in normalized:
            normalized["categoryId"] = str(normalized["categoryId"] or "").strip() or None
        elif "category_id" in normalized:
            normalized["category_id"] = str(normalized["category_id"] or "").strip() or None
        return normalized

    @classmethod
    def apply_category(cls, normalized: dict[str, Any], *, default_other: bool = False) -> dict[str, Any]:
        category_id = normalized.get("categoryId") or normalized.get("category_id")
        if not category_id and default_other:
            category_id = RawMaterialCategoryService.get_other_category_id()
            normalized["categoryId"] = category_id

        if category_id:
            category = RawMaterialCategoryService.get(str(category_id))
            normalized["categoryId"] = category["id"]
            normalized["category"] = category["name"]
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload)
        normalized["code"] = normalized.get("code") or cls.code_from_name(
            str(normalized.get("name", ""))
        )
        normalized.setdefault("qtyKg", normalized.get("qty", 0))
        normalized.setdefault("pricePerKg", 0)
        return cls._db_create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return cls._db_update(item_id, cls.normalize_payload(payload))

    @classmethod
    def search(cls, query_text: str, limit: int = 100) -> list[dict[str, Any]]:
        needle = str(query_text or "").lower()
        rows = cls._db_list(limit=limit)
        return [
            row
            for row in rows
            if needle in str(row.get("name") or "").lower()
            or needle in str(row.get("code") or "").lower()
        ][:limit]

    @classmethod
    def low_stock(cls, threshold: float) -> list[dict[str, Any]]:
        rows = cls._db_list(limit=1000)
        return [row for row in rows if float(row.get("qtyKg") or 0) <= threshold]

    @classmethod
    def adjust_stock(cls, item_id: str, adjustment: float) -> dict[str, Any]:
        if float(adjustment or 0) == 0:
            return cls.get(item_id)
        db.inventory_movement(
            inventory_item_id=item_id,
            quantity_delta=adjustment,
            movement_type="adjust",
            related_entity_type="raw_material",
            related_entity_id=item_id,
            reason="Manual raw material adjustment",
        )
        return cls.get(item_id)

    @classmethod
    def update_stock(cls, item_id: str, new_quantity: float) -> dict[str, Any]:
        current = cls.get(item_id)
        adjustment = float(new_quantity) - float(current.get("qtyKg") or 0)
        return cls.adjust_stock(item_id, adjustment)

    @classmethod
    def get_by_code(cls, code: str) -> dict[str, Any] | None:
        item = db.one(
            db.execute(
                db.client()
                .table("inventory_items")
                .select("id")
                .eq("item_kind", "raw_material")
                .eq("item_code", code)
                .limit(1)
            )
        )
        return cls.get(str(item["id"])) if item else None

    @classmethod
    def delete(cls, item_id: str) -> None:
        if db.one(
            db.execute(
                db.client()
                .table("product_formula_items")
                .select("id")
                .eq("raw_material_id", item_id)
                .limit(1)
            )
        ):
            raise ServiceError("Cannot delete raw material used in products", 409)
        db.execute(db.client().table("inventory_items").update({"is_active": False}).eq("id", item_id))
        return None

    @classmethod
    def _db_list(cls, **kwargs) -> list[dict[str, Any]]:
        limit = max(1, min(int(kwargs.get("limit") or 500), 1000))
        rows = db.data(
            db.execute(
                db.client()
                .table("inventory_items")
                .select("*")
                .eq("item_kind", "raw_material")
                .order("item_name")
                .limit(limit)
            )
        )
        return [cls._db_to_app(row) for row in rows]

    @classmethod
    def _db_get(cls, item_id: str) -> dict[str, Any]:
        item = db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("inventory_items")
                    .select("*")
                    .eq("id", item_id)
                    .eq("item_kind", "raw_material")
                    .limit(1)
                )
            ),
            "Raw material not found",
        )
        return cls._db_to_app(item)

    @classmethod
    def _db_to_app(cls, item: dict[str, Any]) -> dict[str, Any]:
        item_id = str(item["id"])
        detail = db.one(
            db.execute(
                db.client()
                .table("raw_materials")
                .select("*")
                .eq("inventory_item_id", item_id)
                .limit(1)
            )
        ) or {}
        category = None
        if detail.get("category_id"):
            category = db.one(
                db.execute(
                    db.client()
                    .table("raw_material_categories")
                    .select("id, name, code")
                    .eq("id", detail["category_id"])
                    .limit(1)
                )
            )
        quantity = db.get_inventory_quantity(inventory_item_id=item_id)
        metadata = item.get("metadata") or {}
        row = {
            "id": item_id,
            "name": item.get("item_name"),
            "code": item.get("item_code"),
            "categoryId": detail.get("category_id"),
            "category_id": detail.get("category_id"),
            "category": (category or {}).get("name"),
            "location": metadata.get("location"),
            "pricePerKg": db.as_float(detail.get("price_per_kg_usd")),
            "price_per_kg": db.as_float(detail.get("price_per_kg_usd")),
            "coaLink": detail.get("coa_reference"),
            "comments": detail.get("comments"),
            "qtyKg": float(quantity),
            "qty_kg": float(quantity),
            "qty": float(quantity),
            "createdAt": db.timestamp_ms(item.get("created_at")),
            "updatedAt": db.timestamp_ms(item.get("updated_at")),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
        }
        return cls.with_qty_alias(row)

    @classmethod
    def _db_create(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        item = db.create_inventory_item(
            item_kind="raw_material",
            item_name=normalized["name"],
            item_code=normalized.get("code"),
            unit_of_measure="kg",
            metadata={"location": normalized.get("location")},
        )
        item_id = str(item["id"])
        db.execute(
            db.client()
            .table("raw_materials")
            .insert(
                {
                    "inventory_item_id": item_id,
                    "category_id": normalized.get("categoryId") or normalized.get("category_id"),
                    "price_per_kg_usd": db.decimal_str(normalized.get("pricePerKg")),
                    "coa_reference": normalized.get("coaLink"),
                    "comments": normalized.get("comments"),
                }
            )
        )
        location_id = db.ensure_location(normalized.get("location"))
        quantity = db.as_decimal(normalized.get("qtyKg") or normalized.get("qty"))
        if quantity > 0:
            lot = db.one(
                db.execute(
                    db.client()
                    .table("inventory_lots")
                    .insert(
                        {
                            "inventory_item_id": item_id,
                            "lot_code": normalized.get("code") or item_id,
                            "location_id": location_id,
                            "status": "available",
                        }
                    )
                )
            )
            db.inventory_movement(
                inventory_item_id=item_id,
                inventory_lot_id=str(lot["id"]) if lot else None,
                location_id=location_id,
                quantity_delta=quantity,
                movement_type="receive",
                related_entity_type="raw_material",
                related_entity_id=item_id,
                reason="Initial raw material stock",
            )
        return cls.get(item_id)

    @classmethod
    def _db_update(cls, item_id: str, normalized: dict[str, Any]) -> dict[str, Any]:
        item_payload = {}
        if "name" in normalized:
            item_payload["item_name"] = normalized["name"]
        if "code" in normalized:
            item_payload["item_code"] = normalized["code"]
        if "location" in normalized:
            current_item = db.one(
                db.execute(
                    db.client()
                    .table("inventory_items")
                    .select("metadata")
                    .eq("id", item_id)
                    .limit(1)
                )
            ) or {}
            metadata = dict(current_item.get("metadata") or {})
            metadata["location"] = normalized.get("location")
            item_payload["metadata"] = metadata
        if item_payload:
            db.execute(db.client().table("inventory_items").update(item_payload).eq("id", item_id))

        detail_payload = {}
        if "categoryId" in normalized or "category_id" in normalized:
            detail_payload["category_id"] = normalized.get("categoryId") or normalized.get("category_id")
        if "pricePerKg" in normalized:
            detail_payload["price_per_kg_usd"] = db.decimal_str(normalized.get("pricePerKg"))
        if "coaLink" in normalized:
            detail_payload["coa_reference"] = normalized.get("coaLink")
        if "comments" in normalized:
            detail_payload["comments"] = normalized.get("comments")
        if detail_payload:
            db.execute(
                db.client().table("raw_materials").update(detail_payload).eq("inventory_item_id", item_id)
            )
        if "qtyKg" in normalized or "qty" in normalized:
            cls.update_stock(item_id, float(normalized.get("qtyKg") or normalized.get("qty") or 0))
        return cls.get(item_id)


class RawMaterialCategoryService(TableService):
    table_name = "raw_material_categories"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "name")
        kwargs.setdefault("descending", False)
        return super().list(**kwargs)

    @staticmethod
    def normalize_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)
        if "name" in normalized:
            normalized["name"] = str(normalized["name"] or "").strip()
            if not normalized["name"]:
                raise ServiceError("Category name is required", 400)
        elif not partial:
            raise ServiceError("Category name is required", 400)
        if "description" in normalized:
            normalized["description"] = str(normalized["description"] or "").strip() or None
        if not partial:
            normalized.setdefault("isActive", True)
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls.normalize_payload(payload)
        normalized["code"] = (
            str(payload.get("code") or normalized.get("name") or "")
            .strip()
            .upper()
            .replace(" ", "_")
        )
        return super().create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls.get(item_id)
        return super().update(item_id, cls.normalize_payload(payload, partial=True))

    @classmethod
    def delete(cls, item_id: str) -> None:
        try:
            response = (
                cls.client()
                .table("raw_materials")
                .select("id")
                .eq("category_id", item_id)
                .limit(1)
                .execute()
            )
        except Exception as error:
            raise translate_error(error) from error
        if response.data:
            raise ServiceError("Cannot delete category used by raw materials", 409)
        super().delete(item_id)

    @classmethod
    def get_other_category_id(cls) -> str:
        raise ServiceError(
            "Other is not a saved database category. Select a category or leave category blank.",
            400,
        )


__all__ = ["RawMaterialCategoryService", "RawMaterialService"]
