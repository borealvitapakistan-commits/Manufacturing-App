from __future__ import annotations

from typing import Any

from services.base_service import ServiceError, TableService


class VendorService(TableService):
    table_name = "vendors"

    @staticmethod
    def normalize_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)

        if "name" in normalized:
            normalized["name"] = str(normalized["name"] or "").strip()
            if not normalized["name"]:
                raise ServiceError("Vendor name is required", 400)
        elif not partial:
            raise ServiceError("Vendor name is required", 400)

        if "vendorCode" in normalized:
            normalized["vendorCode"] = str(normalized["vendorCode"] or "").strip()
            if not normalized["vendorCode"]:
                raise ServiceError("PO Prefix is required", 400)
            if not normalized["vendorCode"].isdigit():
                raise ServiceError("PO Prefix must be numeric, like 25 or 26.", 400)
        elif not partial:
            raise ServiceError("PO Prefix is required", 400)

        if "categories" in normalized and not normalized["categories"]:
            raise ServiceError("Select at least one vendor category.", 400)

        for key in (
            "shortCode", "phone", "email", "whatsapp", "country",
            "city", "address", "website", "paymentTerms", "notes",
        ):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None

        if not partial:
            normalized.setdefault("isActive", True)
            normalized.setdefault("categories", [])

        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        return super().create(cls.normalize_payload(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls.get(item_id)
        return super().update(item_id, cls.normalize_payload(payload, partial=True))

__all__ = ["VendorService"]
