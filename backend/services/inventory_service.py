from __future__ import annotations

from datetime import date, datetime
from typing import Any

from .base_service import ServiceError, TableService, translate_error
from .converters import payload_to_db, row_to_app


FINISHED_GOOD_FIELDS = {
    "batchId",
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


class FinishedGoodsService(TableService):
    table_name = "finished_goods"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "updated_at")
        kwargs.setdefault("descending", True)
        return super().list(**kwargs)

    @classmethod
    def get_by_batch(cls, batch_id: str) -> dict[str, Any] | None:
        try:
            response = (
                cls.client()
                .table(cls.table_name)
                .select("*")
                .eq("batch_id", batch_id)
                .maybe_single()
                .execute()
            )
            data = getattr(response, "data", None)
            return row_to_app(data) if data else None
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def _clean_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned = {key: value for key, value in payload.items() if key in FINISHED_GOOD_FIELDS}
        if "expiryDate" in cleaned:
            cleaned["expiryDate"] = sql_date(cleaned["expiryDate"])
        for field in ("name", "location", "comments"):
            if field in cleaned:
                cleaned[field] = str(cleaned[field] or "").strip()
        return cleaned

    @classmethod
    def _batch_snapshot(cls, batch_id: str) -> dict[str, Any]:
        try:
            response = (
                cls.client()
                .table("batches")
                .select("id, brand_id, product_id, batch_code, brand_name, product_name")
                .eq("id", batch_id)
                .maybe_single()
                .execute()
            )
            data = getattr(response, "data", None)
            if not data:
                raise ServiceError("Batch not found", 404)
            return row_to_app(data) or {}
        except ServiceError:
            raise
        except Exception as error:
            raise translate_error(error) from error

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
        reason = str(payload.get("reason") or "").strip()
        if not reason:
            raise ServiceError("Reason is required for manual finished-goods creation", 400)
        batch_id = str(payload.get("batchId") or "").strip()
        if not batch_id:
            raise ServiceError("batchId is required", 400)
        batch = cls._batch_snapshot(batch_id)
        normalized = cls._clean_payload(
            {
                **payload,
                "batchId": batch_id,
                "brandId": batch["brandId"],
                "productId": batch["productId"],
                "batchCode": batch["batchCode"],
                "brandName": batch["brandName"],
                "productName": batch["productName"],
                "category": payload.get("category") or "powder",
                "name": payload.get("name") or batch["productName"],
                "location": payload.get("location") or "",
                "comments": payload.get("comments") or "",
            }
        )
        created = super().create(normalized)
        cls._record_history(
            str(created["id"]),
            source="manual",
            change_type="manual_create",
            changes={
                key: {"old": None, "new": value}
                for key, value in normalized.items()
            },
            reason=reason,
        )
        return created

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
        reason = str(reason or "").strip()
        if source == "manual" and not reason:
            raise ServiceError("Reason is required for manual finished-goods updates", 400)
        before = cls.get(item_id)
        normalized = cls._clean_payload(changes)
        changed = {
            key: {"old": before.get(key), "new": value}
            for key, value in normalized.items()
            if before.get(key) != value
        }
        if not changed:
            return before
        updated = super().update(item_id, normalized)
        cls._record_history(
            item_id,
            source=source,
            change_type=change_type or ("manual_edit" if source == "manual" else "auto_update"),
            changes=changed,
            reason=reason or None,
        )
        return updated

    @classmethod
    def create_as_powder(
        cls,
        batch_id: str,
        *,
        weight_kg: float | None = None,
    ) -> dict[str, Any]:
        existing = cls.get_by_batch(batch_id)
        if existing:
            return cls.update_with_history(
                str(existing["id"]),
                {
                    "category": "powder",
                    "name": existing.get("name") or existing.get("productName"),
                    **({"weightKg": weight_kg} if weight_kg is not None else {}),
                },
                reason="Auto-transition after Mixing completion",
                source="auto",
                change_type="transitioned_to_powder",
            )

        batch = cls._batch_snapshot(batch_id)
        normalized = {
            "batchId": batch_id,
            "brandId": batch["brandId"],
            "productId": batch["productId"],
            "batchCode": batch["batchCode"],
            "brandName": batch["brandName"],
            "productName": batch["productName"],
            "category": "powder",
            "name": batch["productName"],
            "location": "",
            "comments": "",
            "weightKg": weight_kg,
        }
        created = TableService.create.__func__(cls, normalized)
        cls._record_history(
            str(created["id"]),
            source="auto",
            change_type="created_as_powder",
            changes={
                "category": {"old": None, "new": "powder"},
                "name": {"old": None, "new": batch["productName"]},
            },
            reason="Auto-created after Mixing completion",
        )
        return created

    @classmethod
    def transition_to_capsule(
        cls,
        batch_id: str,
        *,
        capsule_code: str | None = None,
        capsule_mg: float | None = None,
        capsule_weight_kg: float | None = None,
        capsule_amount: int | None = None,
    ) -> dict[str, Any]:
        existing = cls.get_by_batch(batch_id) or cls.create_as_powder(batch_id)
        return cls.update_with_history(
            str(existing["id"]),
            {
                "category": "capsule",
                "capsuleCode": capsule_code,
                "capsuleMg": capsule_mg,
                "capsuleWeightKg": capsule_weight_kg,
                "capsuleAmount": capsule_amount,
            },
            reason="Auto-transition after NJP completion",
            source="auto",
            change_type="transitioned_to_capsule",
        )

    @classmethod
    def transition_to_bottle(
        cls,
        batch_id: str,
        *,
        bottle_total: int | None = None,
        expiry_date: Any = None,
    ) -> dict[str, Any]:
        existing = cls.get_by_batch(batch_id) or cls.create_as_powder(batch_id)
        return cls.update_with_history(
            str(existing["id"]),
            {
                "category": "bottle",
                "bottleTotal": bottle_total,
                "expiryDate": sql_date(expiry_date),
            },
            reason="Auto-transition after Assembly completion",
            source="auto",
            change_type="transitioned_to_bottle",
        )
