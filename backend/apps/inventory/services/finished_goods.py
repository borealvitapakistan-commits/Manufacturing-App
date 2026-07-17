from __future__ import annotations

from datetime import date, datetime
from typing import Any

from services import db
from services.base_service import ServiceError, TableService


FINISHED_GOOD_FIELDS = {
    "brandId",
    "productId",
    "batchCode",
    "brandName",
    "productName",
    "category",
    "name",
    "location",
    "comments",
    "powderNo",
    "rackNo",
    "weightKg",
    "capsuleCode",
    "bucket",
    "capsuleMg",
    "capsuleWeightKg",
    "capsuleAmount",
    "capsuleStatus",
    "boxNo",
    "bottleTotal",
    "expiryDate",
}


def sql_date(value: Any) -> str | None:
    if value in {None, ""}:
        return None
    if isinstance(value, str) and len(value) >= 10 and value[4] == "-" and value[7] == "-":
        return value[:10]
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000).date().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


class FinishedGoodsHistoryService(TableService):
    table_name = "finished_goods_history"

    @classmethod
    def list(cls, **kwargs):
        return []


class FinishedGoodsService(TableService):
    table_name = "finished_goods"

    @classmethod
    def list(cls, **kwargs):
        return cls._db_list(**kwargs)

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        for record in cls._db_list(limit=1000):
            if str(record.get("id")) == str(item_id):
                return record
        raise ServiceError("Finished goods record not found", 404)

    @classmethod
    def _clean_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned = {key: value for key, value in payload.items() if key in FINISHED_GOOD_FIELDS}
        if "expiryDate" in cleaned:
            cleaned["expiryDate"] = sql_date(cleaned["expiryDate"])
        for field in ("batchCode", "brandName", "productName", "name", "location", "comments"):
            if field in cleaned:
                cleaned[field] = str(cleaned[field] or "").strip()
        return cleaned

    @classmethod
    def _record_history(
        cls,
        item_id: str,
        *,
        source: str,
        change_type: str,
        changes: dict[str, Any],
        reason: str | None,
    ) -> None:
        FinishedGoodsHistoryService.create(
            {
                "finishedGoodId": item_id,
                "changeSource": source,
                "changeType": change_type,
                "changes": changes,
                "reason": reason,
            }
        )

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        raise ServiceError(
            "Finished goods are generated from Mixing, NJP, and Assembly records. Edit the source record instead.",
            400,
        )

    @classmethod
    def update_with_history(
        cls,
        item_id: str,
        changes: dict[str, Any],
        *,
        reason: str,
        source: str = "manual",
        change_type: str | None = None,
    ) -> dict[str, Any]:
        raise ServiceError(
            "Finished goods are generated from Mixing, NJP, and Assembly records. Edit the source record instead.",
            400,
        )

    @classmethod
    def delete(cls, item_id: str) -> None:
        raise ServiceError(
            "Finished goods are generated from Mixing, NJP, and Assembly records. Delete the source record instead.",
            400,
        )

    @classmethod
    def _db_list(cls, **kwargs) -> list[dict[str, Any]]:
        filters = kwargs.get("filters") or {}
        search = kwargs.get("search")
        limit = max(1, min(int(kwargs.get("limit") or 500), 1000))
        category = str(filters.get("category") or "").strip().lower()

        records: list[dict[str, Any]] = []
        if category in {"", "powder"}:
            records.extend(cls._db_powders(limit=limit))
        if category in {"", "capsule"}:
            records.extend(cls._db_capsules(limit=limit))
        if category in {"", "bottle"}:
            records.extend(cls._db_bottles(limit=limit))

        records = [record for record in records if cls._matches_filters(record, filters)]
        if search and search[1]:
            needle = str(search[1]).lower()
            records = [
                record
                for record in records
                if needle in str(record.get("name") or "").lower()
                or needle in str(record.get("productName") or "").lower()
                or needle in str(record.get("batchCode") or "").lower()
                or needle in str(record.get("mixingCode") or "").lower()
                or needle in str(record.get("capsuleCode") or "").lower()
            ]
        records.sort(key=lambda row: str(row.get("updated_at") or row.get("created_at") or ""), reverse=True)
        return records[:limit]

    @staticmethod
    def _brand_ids(row: dict[str, Any]) -> list[str]:
        raw_ids = row.get("brand_ids") or row.get("brandIds") or []
        if isinstance(raw_ids, str):
            return [item.strip() for item in raw_ids.strip("{}").split(",") if item.strip()]
        return [str(item) for item in raw_ids if item not in (None, "")]

    @classmethod
    def _matches_filters(cls, record: dict[str, Any], filters: dict[str, Any]) -> bool:
        brand_id = filters.get("brand_id")
        product_id = filters.get("product_id")
        category = filters.get("category")
        if category and str(record.get("category")) != str(category):
            return False
        if product_id and str(record.get("productId") or "") != str(product_id):
            return False
        if brand_id:
            if str(record.get("brandId") or "") == str(brand_id):
                return True
            return str(brand_id) in [str(item) for item in (record.get("brandIds") or [])]
        return True

    @classmethod
    def _db_powders(cls, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("v_mixing_reports")
                .select("*")
                .order("updated_at", desc=True)
                .limit(limit)
            )
        )
        return [
            {
                "id": str(row["id"]),
                "category": "powder",
                "brandId": None,
                "brandIds": cls._brand_ids(row),
                "brandName": row.get("brand_names"),
                "productId": row.get("product_id"),
                "productName": row.get("product_name"),
                "productCode": row.get("product_code"),
                "name": row.get("product_name"),
                "batchCode": row.get("mixing_code"),
                "mixingCode": row.get("mixing_code"),
                "powderNo": row.get("mixing_code"),
                "location": row.get("location"),
                "rackNo": row.get("location"),
                "weightKg": db.as_float(row.get("available_mixed_powder_kg")),
                "comments": row.get("remarks"),
                "createdAt": db.timestamp_ms(row.get("created_at")),
                "updatedAt": db.timestamp_ms(row.get("updated_at")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
            for row in rows
        ]

    @classmethod
    def _db_capsules(cls, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("v_njp_reports")
                .select("*")
                .order("updated_at", desc=True)
                .limit(limit)
            )
        )
        return [
            {
                "id": str(row["id"]),
                "category": "capsule",
                "brandId": None,
                "brandIds": cls._brand_ids(row),
                "brandName": row.get("brand_names"),
                "productId": row.get("product_id"),
                "productName": row.get("product_name"),
                "productCode": row.get("product_code"),
                "name": row.get("product_name"),
                "batchCode": row.get("njp_code"),
                "mixingCode": row.get("mixing_code"),
                "capsuleCode": row.get("njp_code"),
                "bucket": row.get("bucket"),
                "location": row.get("location"),
                "capsuleMg": db.as_float(row.get("target_fill_weight_mg")),
                "capsuleWeightKg": db.as_float(row.get("total_capsules_produced_kg")),
                "capsuleAmount": int(db.as_float(row.get("available_capsules_qty"))),
                "capsuleStatus": row.get("status"),
                "comments": row.get("remarks"),
                "createdAt": db.timestamp_ms(row.get("created_at")),
                "updatedAt": db.timestamp_ms(row.get("updated_at")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
            for row in rows
        ]

    @classmethod
    def _db_bottles(cls, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("v_finished_goods")
                .select("*")
                .order("updated_at", desc=True)
                .limit(limit)
            )
        )
        return [
            {
                "id": str(row["id"]),
                "category": "bottle",
                "brandId": row.get("brand_id"),
                "brandIds": [str(row.get("brand_id"))] if row.get("brand_id") else [],
                "brandName": row.get("brand_name"),
                "productId": row.get("product_id"),
                "productName": row.get("product_name"),
                "productCode": row.get("product_code"),
                "name": row.get("product_name"),
                "batchCode": row.get("batch_code"),
                "assemblyCode": row.get("assembly_code"),
                "capsuleCode": row.get("njp_code"),
                "mixingCode": row.get("mixing_code"),
                "location": row.get("location"),
                "boxNo": row.get("box_number"),
                "bottleTotal": int(db.as_float(row.get("available_bottles"))),
                "bottleTotalMade": int(db.as_float(row.get("total_bottles"))),
                "expiryDate": row.get("expiry_date"),
                "productionDate": row.get("production_date"),
                "status": row.get("status"),
                "comments": row.get("comments"),
                "createdAt": db.timestamp_ms(row.get("created_at")),
                "updatedAt": db.timestamp_ms(row.get("updated_at")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
            for row in rows
        ]
