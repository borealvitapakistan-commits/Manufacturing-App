from __future__ import annotations

from typing import Any

from services import db
from services.base_service import ServiceError, TableService


class BrandService(TableService):
    table_name = "brands"

    @classmethod
    def list(cls, **kwargs):
        return cls._db_list(**kwargs)

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
            "contactName",
            "contactEmail",
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
        return cls._db_create(cls.normalize_payload(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        cls.get(item_id)
        return cls._db_update(item_id, cls.normalize_payload(payload, partial=True))

    @classmethod
    def delete(cls, item_id: str) -> None:
        for table, column in (
            ("mixing_brands", "brand_id"),
            ("assembly_brands", "brand_id"),
            ("assembly_brand_lots", "brand_id"),
            ("label_specs", "brand_id"),
        ):
            if db.one(
                db.execute(
                    db.client().table(table).select("id").eq(column, item_id).limit(1)
                )
            ):
                raise ServiceError(
                    "Cannot delete brand with existing manufacturing or inventory records",
                    409,
                )
        db.execute(db.client().table("brands").delete().eq("id", item_id))
        return None

    @classmethod
    def toggle_active(cls, item_id: str) -> dict[str, Any]:
        existing = cls.get(item_id)
        return cls.update(item_id, {"isActive": not existing.get("isActive", True)})

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(
            db.one(
                db.execute(
                    db.client().table("brands").select("*").eq("id", item_id).limit(1)
                )
            ),
            "Brand not found",
        )
        return cls._db_to_app(row)

    @classmethod
    def _db_list(cls, **kwargs) -> list[dict[str, Any]]:
        limit = max(1, min(int(kwargs.get("limit") or 500), 1000))
        query = db.client().table("brands").select("*")
        filters = kwargs.get("filters") or {}
        for key, value in filters.items():
            if value not in (None, ""):
                db_key = {"is_active": "is_active", "isActive": "is_active"}.get(key, key)
                query = query.eq(db_key, value)
        rows = db.data(db.execute(query.order("name").limit(limit)))
        return [cls._db_to_app(row) for row in rows]

    @staticmethod
    def _db_to_app(row: dict[str, Any]) -> dict[str, Any]:
        metadata = row.get("metadata") or {}

        def value(column: str, metadata_key: str | None = None, default: Any = None) -> Any:
            raw = row.get(column)
            if raw not in (None, ""):
                return raw
            if metadata_key:
                return metadata.get(metadata_key, default)
            return default

        return {
            "id": str(row["id"]),
            "name": row.get("name"),
            "codePrefix": row.get("code_prefix"),
            "code_prefix": row.get("code_prefix"),
            "shortName": value("short_name", "shortName"),
            "contactName": value("contact_name", "contactName"),
            "contactEmail": value("contact_email", "contactEmail"),
            "addressLine1": value("address_line_1", "addressLine1") or row.get("address"),
            "addressLine2": value("address_line_2", "addressLine2"),
            "city": value("city", "city"),
            "province": value("province", "province"),
            "country": value("country", "country"),
            "phone": value("contact_phone", "phone"),
            "notes": row.get("notes"),
            "logoUrl": value("logo_url", "logoUrl"),
            "color": value("brand_color", "color", "#16a34a") or "#16a34a",
            "isActive": row.get("is_active", True),
            "createdAt": db.timestamp_ms(row.get("created_at")),
            "updatedAt": db.timestamp_ms(row.get("updated_at")),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }

    @classmethod
    def _db_payload(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        metadata_keys = (
            "shortName",
            "contactName",
            "contactEmail",
            "addressLine1",
            "addressLine2",
            "city",
            "province",
            "country",
            "phone",
            "logoUrl",
            "color",
        )
        metadata = {
            key: normalized.get(key)
            for key in metadata_keys
            if key in normalized
        }
        payload: dict[str, Any] = {}
        if "name" in normalized:
            payload["name"] = normalized["name"]
        if "codePrefix" in normalized:
            payload["code_prefix"] = normalized["codePrefix"]
        if "shortName" in normalized:
            payload["short_name"] = normalized.get("shortName")
        if "contactName" in normalized:
            payload["contact_name"] = normalized.get("contactName")
        if "contactEmail" in normalized:
            payload["contact_email"] = normalized.get("contactEmail")
        if "addressLine1" in normalized:
            payload["address_line_1"] = normalized.get("addressLine1")
        if "addressLine2" in normalized:
            payload["address_line_2"] = normalized.get("addressLine2")
        if "city" in normalized:
            payload["city"] = normalized.get("city")
        if "province" in normalized:
            payload["province"] = normalized.get("province")
        if "country" in normalized:
            payload["country"] = normalized.get("country")
        if "phone" in normalized:
            payload["contact_phone"] = normalized.get("phone")
        if "logoUrl" in normalized:
            payload["logo_url"] = normalized.get("logoUrl")
        if "color" in normalized:
            payload["brand_color"] = normalized.get("color") or "#16a34a"
        if "addressLine1" in normalized or "addressLine2" in normalized:
            payload["address"] = " ".join(
                item
                for item in (
                    normalized.get("addressLine1"),
                    normalized.get("addressLine2"),
                )
                if item
            ) or None
        if "notes" in normalized:
            payload["notes"] = normalized.get("notes")
        if "isActive" in normalized:
            payload["is_active"] = normalized.get("isActive")
        if metadata:
            payload["metadata"] = db.json_safe(metadata)
        return payload

    @classmethod
    def _db_create(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        created = db.one(db.execute(db.client().table("brands").insert(cls._db_payload(normalized))))
        brand = db.require_row(created, "Brand was not saved", 500)
        return cls.get(str(brand["id"]))

    @classmethod
    def _db_update(cls, item_id: str, normalized: dict[str, Any]) -> dict[str, Any]:
        payload = cls._db_payload(normalized)
        if payload:
            if "metadata" in payload:
                existing_row = db.one(
                    db.execute(
                        db.client().table("brands").select("metadata").eq("id", item_id).limit(1)
                    )
                ) or {}
                payload["metadata"] = db.json_safe(
                    {**(existing_row.get("metadata") or {}), **payload["metadata"]}
                )
            db.execute(db.client().table("brands").update(payload).eq("id", item_id))
        return cls.get(item_id)


__all__ = ["BrandService"]
