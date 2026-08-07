from __future__ import annotations

from typing import Any

from services import db
from services.base_service import ServiceError


RECORD_TABLES = {
    "items": {"table": "inventory_items", "order_by": "created_at"},
    "lots": {"table": "inventory_lots", "order_by": "created_at"},
    "balances": {"table": "inventory_balances", "order_by": "updated_at"},
    "movements": {"table": "inventory_movements", "order_by": "created_at"},
    "locations": {"table": "inventory_locations", "order_by": "created_at"},
}

RECORD_ALIASES = {
    "inventory-items": "items",
    "inventory_items": "items",
    "inventory-lots": "lots",
    "inventory_lots": "lots",
    "inventory-balances": "balances",
    "inventory_balances": "balances",
    "inventory-movements": "movements",
    "inventory_movements": "movements",
    "inventory-locations": "locations",
    "inventory_locations": "locations",
}


class InventoryRecordService:
    @classmethod
    def list(cls, record_type: str, *, limit: Any = 200) -> list[dict[str, Any]]:
        key = cls._normalize_record_type(record_type)
        config = RECORD_TABLES.get(key)
        if not config:
            raise ServiceError("Inventory record type is not supported.", 400)

        response = db.execute(
            db.client()
            .table(config["table"])
            .select("*")
            .order(config["order_by"], desc=True)
            .limit(cls._normalize_limit(limit))
        )
        return [db.json_safe(row) for row in db.data(response)]

    @staticmethod
    def _normalize_record_type(record_type: str) -> str:
        key = str(record_type or "").strip().lower().replace("_", "-")
        return RECORD_ALIASES.get(key, key)

    @staticmethod
    def _normalize_limit(value: Any) -> int:
        try:
            return max(1, min(int(value), 500))
        except (TypeError, ValueError):
            return 200


__all__ = ["InventoryRecordService"]
