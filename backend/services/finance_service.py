from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .base_service import ServiceError, TableService, translate_error


class ExpenseBookService(TableService):
    table_name = "expense_books"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "created_at")
        kwargs.setdefault("descending", False)
        return super().list(**kwargs)

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls._normalize(payload)
        return super().create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return super().update(item_id, cls._normalize(payload, partial=True))

    @staticmethod
    def _normalize(payload: dict[str, Any], partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)
        if "name" in normalized:
            normalized["name"] = str(normalized["name"] or "").strip()
            if not normalized["name"]:
                raise ServiceError("Expense book name is required", 400)
        elif not partial:
            raise ServiceError("Expense book name is required", 400)
        if "openingAdjustments" in normalized:
            adjustments = normalized["openingAdjustments"] or []
            normalized["openingAdjustments"] = adjustments
            normalized["openingBalanceCurrent"] = round(
                sum(float(item.get("amount") or 0) for item in adjustments), 4
            )
        for key in ("description",):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None
        if "tags" in normalized:
            normalized["tags"] = [
                str(item).strip()
                for item in (normalized["tags"] or [])
                if str(item).strip()
            ]
        if not partial:
            normalized.setdefault("currency", "PKR")
            normalized.setdefault("status", "open")
            normalized.setdefault("isActive", True)
            normalized.setdefault("hasPendingCarry", False)
            normalized.setdefault("pendingCarryAmount", 0)
        return normalized

    @classmethod
    def balance(cls, item_id: str) -> dict[str, Any]:
        book = cls.get(item_id)
        rows = ExpenseService.list(
            filters={"book_id": item_id},
            order_by="date",
            descending=False,
            limit=500,
        )
        debit = sum(
            float(row.get("amount") or 0)
            for row in rows
            if row.get("direction") == "debit"
        )
        credit = sum(
            float(row.get("amount") or 0)
            for row in rows
            if row.get("direction") == "credit"
        )
        opening = float(book.get("openingBalanceCurrent") or 0)
        return {
            "bookId": item_id,
            "openingBalance": opening,
            "debit": round(debit, 4),
            "credit": round(credit, 4),
            "balance": round(opening + credit - debit, 4),
        }

    @classmethod
    def close(
        cls,
        item_id: str,
        *,
        mode: str = "later",
        target_book_id: str | None = None,
        new_book_name: str | None = None,
        source_description: str | None = None,
    ) -> dict[str, Any]:
        if mode not in {"later", "transfer", "new"}:
            raise ServiceError("Close mode must be later, transfer, or new", 400)

        source = cls.get(item_id)
        if source.get("status") == "closed":
            raise ServiceError("Expense book is already closed", 409)

        balance = float(cls.balance(item_id)["balance"])
        closed_at = datetime.now(UTC).isoformat()
        if abs(balance) < 0.0001:
            closed = cls.update(
                item_id,
                {
                    "status": "closed",
                    "isActive": False,
                    "hasPendingCarry": False,
                    "pendingCarryAmount": 0,
                    "closedAt": closed_at,
                },
            )
            return {"book": closed, "targetBook": None}

        if mode == "later":
            closed = cls.update(
                item_id,
                {
                    "status": "closed",
                    "isActive": False,
                    "hasPendingCarry": True,
                    "pendingCarryAmount": balance,
                    "closedAt": closed_at,
                },
            )
            return {"book": closed, "targetBook": None}

        if mode == "new":
            target = cls.create(
                {
                    "name": str(new_book_name or "").strip()
                    or f"{source['name']} - Next Period",
                    "description": "",
                    "currency": source.get("currency") or "PKR",
                    "openingBalanceCurrent": 0,
                    "openingAdjustments": [],
                    "tags": source.get("tags") or [],
                    "status": "open",
                    "isActive": True,
                }
            )
        else:
            if not target_book_id:
                raise ServiceError("Target expense book is required", 400)
            target = cls.get(target_book_id)
            if target.get("status") != "open" or target.get("isActive") is False:
                raise ServiceError("Target expense book must be open", 409)

        cls._create_transfer_entries(
            source,
            target,
            balance,
            source_description=source_description,
            pending_only=False,
        )
        closed = cls.update(
            item_id,
            {
                "status": "closed",
                "isActive": False,
                "hasPendingCarry": False,
                "pendingCarryAmount": 0,
                "carriedToBookId": target["id"],
                "closedAt": closed_at,
            },
        )
        return {"book": closed, "targetBook": target}

    @classmethod
    def pull_carry(cls, source_book_id: str, target_book_id: str) -> dict[str, Any]:
        source = cls.get(source_book_id)
        target = cls.get(target_book_id)
        amount = float(source.get("pendingCarryAmount") or 0)
        if not source.get("hasPendingCarry") or abs(amount) < 0.0001:
            raise ServiceError("Source book has no pending carry", 409)
        if target.get("status") != "open" or target.get("isActive") is False:
            raise ServiceError("Target expense book must be open", 409)

        cls._create_transfer_entries(
            source,
            target,
            amount,
            source_description=None,
            pending_only=True,
        )
        updated_source = cls.update(
            source_book_id,
            {
                "pendingCarryAmount": 0,
                "hasPendingCarry": False,
                "carriedToBookId": target_book_id,
            },
        )
        return {"sourceBook": updated_source, "targetBook": target}

    @staticmethod
    def _create_transfer_entries(
        source: dict[str, Any],
        target: dict[str, Any],
        amount: float,
        *,
        source_description: str | None,
        pending_only: bool,
    ) -> None:
        now_ms = int(datetime.now(UTC).timestamp() * 1000)
        if amount > 0:
            if not pending_only:
                ExpenseService.create(
                    {
                        "bookId": source["id"],
                        "date": now_ms,
                        "description": f"Closing transfer to {target['name']}",
                        "givenFrom": source["name"],
                        "givenTo": target["name"],
                        "amount": amount,
                        "direction": "debit",
                        "type": "Other",
                        "tags": ["closing", "transfer", target["name"]],
                    }
                )
            ExpenseService.create(
                {
                    "bookId": target["id"],
                    "date": now_ms,
                    "description": f"Opening balance added from {source['name']}",
                    "givenFrom": source["name"],
                    "givenTo": target["name"],
                    "amount": amount,
                    "direction": "credit",
                    "type": "Other",
                    "tags": ["opening", "from book", source["name"]],
                }
            )
            return

        absolute_amount = abs(amount)
        description = str(source_description or "").strip() or "Covered deficit"
        if pending_only:
            ExpenseService.create(
                {
                    "bookId": target["id"],
                    "date": now_ms,
                    "description": f"Opening balance added (covering deficit of {source['name']})",
                    "givenFrom": description if source_description else "external source",
                    "givenTo": target["name"],
                    "amount": absolute_amount,
                    "direction": "credit",
                    "type": "Other",
                    "tags": ["opening", "deficit", source["name"]],
                }
            )
            return
        if not pending_only:
            ExpenseService.create(
                {
                    "bookId": source["id"],
                    "date": now_ms,
                    "description": f"Deficit covered: {description}",
                    "givenFrom": description,
                    "givenTo": source["name"],
                    "amount": absolute_amount,
                    "direction": "credit",
                    "type": "Other",
                    "tags": ["closing", "deficit"],
                }
            )
        ExpenseService.create(
            {
                "bookId": target["id"],
                "date": now_ms,
                "description": f"Covered deficit for {source['name']}",
                "givenFrom": target["name"],
                "givenTo": source["name"],
                "amount": absolute_amount,
                "direction": "debit",
                "type": "Other",
                "tags": ["opening", "deficit", source["name"]],
            }
        )


class ExpenseService(TableService):
    table_name = "expenses"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "date")
        kwargs.setdefault("descending", False)
        return super().list(**kwargs)

    @staticmethod
    def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        if "description" in normalized:
            normalized["description"] = str(
                normalized["description"] or ""
            ).strip()
            if not normalized["description"]:
                raise ServiceError("Description is required", 400)
        for key in ("givenFrom", "givenTo", "type"):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None
        if "tags" in normalized:
            normalized["tags"] = [
                str(item).strip()
                for item in (normalized["tags"] or [])
                if str(item).strip()
            ]
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        cls._ensure_open(str(payload["bookId"]))
        return super().create(cls._normalize(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get(item_id)
        cls._ensure_open(str(payload.get("bookId") or existing["bookId"]))
        return super().update(item_id, cls._normalize(payload))

    @staticmethod
    def _ensure_open(book_id: str) -> None:
        book = ExpenseBookService.get(book_id)
        if book.get("status") == "closed" or book.get("isActive") is False:
            raise ServiceError("This expense book is closed", 409)
