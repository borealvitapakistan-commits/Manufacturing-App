from __future__ import annotations

from typing import Any

from services import db
from services.base_service import ServiceError, TableService


BOTTLE_TYPES = {"capsule", "jar"}
CAPSULE_TYPES = {"200", "250", "300"}


class BottleLidService(TableService):
    table_name = "bottles_lids"

    @classmethod
    def list(cls, **kwargs):
        return cls._db_list(**kwargs)

    @staticmethod
    def normalize_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)

        if "bottleType" in normalized:
            normalized["bottleType"] = str(normalized["bottleType"] or "").strip().lower()
            if normalized["bottleType"] not in BOTTLE_TYPES:
                raise ServiceError("Bottle type must be capsule or jar.", 400)
        elif not partial:
            raise ServiceError("Bottle type is required.", 400)

        bottle_type = normalized.get("bottleType")
        if partial and bottle_type is None:
            return normalized

        if bottle_type == "capsule":
            normalized["capsuleType"] = str(normalized.get("capsuleType") or "").strip()
            if normalized["capsuleType"] not in CAPSULE_TYPES:
                raise ServiceError("Bottle size must be 200, 250, or 300 for Capsule bottles.", 400)
        elif bottle_type == "jar":
            normalized["capsuleType"] = None

        if "quantity" in normalized:
            quantity = int(normalized["quantity"] or 0)
            if quantity < 0:
                raise ServiceError("Quantity cannot be negative.", 400)
            normalized["quantity"] = quantity
        elif not partial:
            raise ServiceError("Quantity is required.", 400)

        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        return cls._db_create(cls.normalize_payload(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = cls.get(item_id)
        merged = {**current, **payload}
        return cls._db_update(item_id, cls.normalize_payload(merged))

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        return cls._db_get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> None:
        db.execute(db.client().table("inventory_items").update({"is_active": False}).eq("id", item_id))
        return None

    @classmethod
    def find_packaging_item(
        cls,
        *,
        bottle_type: str,
        capsule_type: str | None = None,
        item_id: str | None = None,
    ) -> dict[str, Any] | None:
        if item_id:
            try:
                return cls.get(item_id)
            except ServiceError:
                return None
        rows = cls._db_list(filters={"bottle_type": bottle_type, "capsule_type": capsule_type}, limit=1000)
        return rows[0] if rows else None

    @classmethod
    def _db_list(cls, **kwargs) -> list[dict[str, Any]]:
        limit = max(1, min(int(kwargs.get("limit") or 500), 1000))
        rows = db.data(
            db.execute(
                db.client()
                .table("packaging_items")
                .select("inventory_item_id, packaging_type, bottle_size, created_at, inventory_items(*)")
                .limit(limit)
            )
        )
        filters = kwargs.get("filters") or {}

        def matches(row: dict[str, Any]) -> bool:
            app = cls._db_to_app(row)
            for key, value in filters.items():
                if value in (None, ""):
                    continue
                if key in {"bottle_type", "bottleType"} and app.get("bottleType") != value:
                    return False
                if key in {"capsule_type", "capsuleType"} and str(app.get("capsuleType") or "") != str(value):
                    return False
            return True

        return [cls._db_to_app(row) for row in rows if matches(row)]

    @classmethod
    def _db_get(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(
            db.one(
                db.execute(
                    db.client()
                    .table("packaging_items")
                    .select("inventory_item_id, packaging_type, bottle_size, created_at, inventory_items(*)")
                    .eq("inventory_item_id", item_id)
                    .limit(1)
                )
            ),
            "Bottle/Lid inventory record not found",
        )
        return cls._db_to_app(row)

    @staticmethod
    def _db_to_app(row: dict[str, Any]) -> dict[str, Any]:
        item = row.get("inventory_items") or {}
        item_id = str(row.get("inventory_item_id"))
        quantity = int(db.get_inventory_quantity(inventory_item_id=item_id))
        bottle_type = row.get("packaging_type")
        capsule_type = str(row.get("bottle_size")) if row.get("bottle_size") is not None else None
        return {
            "id": item_id,
            "bottleType": bottle_type,
            "capsuleType": capsule_type,
            "bottleSize": capsule_type,
            "quantity": quantity,
            "createdAt": db.timestamp_ms(item.get("created_at") or row.get("created_at")),
            "updatedAt": db.timestamp_ms(item.get("updated_at")),
            "created_at": item.get("created_at") or row.get("created_at"),
            "updated_at": item.get("updated_at"),
        }

    @staticmethod
    def _item_name(normalized: dict[str, Any]) -> str:
        if normalized["bottleType"] == "capsule":
            return f"Capsule {normalized.get('capsuleType')} bottle"
        return "Jar"

    @classmethod
    def _db_create(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        existing = cls.find_packaging_item(
            bottle_type=normalized["bottleType"],
            capsule_type=normalized.get("capsuleType"),
        )
        if existing:
            return cls._db_update(
                str(existing["id"]),
                {
                    **existing,
                    **normalized,
                    "quantity": int(existing.get("quantity") or 0)
                    + int(normalized.get("quantity") or 0),
                },
            )

        item = db.create_inventory_item(
            item_kind="packaging",
            item_name=cls._item_name(normalized),
            item_code=f"PKG-{normalized['bottleType'].upper()}-{normalized.get('capsuleType') or 'JAR'}",
            unit_of_measure="each",
        )
        item_id = str(item["id"])
        db.execute(
            db.client()
            .table("packaging_items")
            .insert(
                {
                    "inventory_item_id": item_id,
                    "packaging_type": normalized["bottleType"],
                    "bottle_size": int(normalized["capsuleType"]) if normalized["bottleType"] == "capsule" else None,
                    "metadata": db.json_safe(normalized),
                }
            )
        )
        quantity = int(normalized.get("quantity") or 0)
        if quantity > 0:
            lot = db.one(
                db.execute(
                    db.client()
                    .table("inventory_lots")
                    .insert(
                        {
                            "inventory_item_id": item_id,
                            "lot_code": item.get("item_code") or item_id,
                            "status": "available",
                        }
                    )
                )
            )
            db.inventory_movement(
                inventory_item_id=item_id,
                inventory_lot_id=str(lot["id"]) if lot else None,
                quantity_delta=quantity,
                movement_type="receive",
                related_entity_type="packaging",
                related_entity_id=item_id,
                reason="Initial bottle/lid stock",
            )
        return cls.get(item_id)

    @classmethod
    def _db_update(cls, item_id: str, normalized: dict[str, Any]) -> dict[str, Any]:
        current = cls.get(item_id)
        db.execute(
            db.client()
            .table("packaging_items")
            .update(
                {
                    "packaging_type": normalized["bottleType"],
                    "bottle_size": int(normalized["capsuleType"]) if normalized["bottleType"] == "capsule" else None,
                    "metadata": db.json_safe(normalized),
                }
            )
            .eq("inventory_item_id", item_id)
        )
        db.execute(
            db.client()
            .table("inventory_items")
            .update({"item_name": cls._item_name(normalized)})
            .eq("id", item_id)
        )
        delta = int(normalized.get("quantity") or 0) - int(current.get("quantity") or 0)
        if delta:
            db.inventory_movement(
                inventory_item_id=item_id,
                quantity_delta=delta,
                movement_type="adjust",
                related_entity_type="packaging",
                related_entity_id=item_id,
                reason="Bottle/lid stock update",
            )
        return cls.get(item_id)


__all__ = ["BottleLidService"]
