from __future__ import annotations

from decimal import Decimal
from typing import Any

from services import db
from services.base_service import ServiceError

ORDER_TYPES = {"raw_material", "label", "product", "bottles_lids", "custom"}
STATUSES = {"draft", "sent", "received", "canceled", "moved_to_po"}


class RequestToQuoteService:
    TABLE = "request_to_quote_documents"
    ITEMS_TABLE = "request_to_quote_document_items"

    # ------------------------------------------------------------------
    # Row <-> app shape
    # ------------------------------------------------------------------

    @classmethod
    def _item_rows(cls, rtq_document_id: str) -> list[dict[str, Any]]:
        return db.data(
            db.execute(
                db.client()
                .table(cls.ITEMS_TABLE)
                .select("*")
                .eq("request_to_quote_document_id", rtq_document_id)
                .order("sr")
            )
        )

    @staticmethod
    def _item_to_app(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "rtqDocumentId": str(row["request_to_quote_document_id"]),
            "sr": int(row.get("sr") or 0),
            "orderType": row.get("order_type") or "raw_material",
            "itemId": str(row["item_id"]) if row.get("item_id") else None,
            "itemName": row.get("item_name") or "",
            "quantity": db.as_float(row.get("quantity")),
            "unitPrice": (
                db.as_float(row.get("unit_price")) if row.get("unit_price") is not None else None
            ),
            "totalPrice": (
                db.as_float(row.get("total_price")) if row.get("total_price") is not None else None
            ),
        }

    @classmethod
    def _db_to_app(cls, row: dict[str, Any], *, items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        doc_id = str(row["id"])
        if items is None:
            items = cls._item_rows(doc_id)
        return {
            "id": doc_id,
            "rtqNumber": row.get("rtq_number") or "",
            "version": int(row.get("version") or 1),
            "vendorId": str(row["vendor_id"]) if row.get("vendor_id") else None,
            "vendorName": row.get("vendor_name") or "",
            "vendorAddress": row.get("vendor_address"),
            "shipToName": row.get("ship_to_name") or "",
            "shipToAddress": row.get("ship_to_address"),
            "shipToPhone": row.get("ship_to_phone"),
            "brandId": str(row["brand_id"]) if row.get("brand_id") else None,
            "rtqDate": row.get("rtq_date"),
            "termsConditions": row.get("terms_conditions"),
            "status": row.get("status") or "draft",
            "subtotal": db.as_float(row.get("subtotal")),
            "items": [cls._item_to_app(item) for item in items],
            "createdAt": db.timestamp_ms(row.get("created_at")),
            "updatedAt": db.timestamp_ms(row.get("updated_at")),
        }

    # ------------------------------------------------------------------
    # Validation / totals
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_items(raw_items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        cleaned = []
        for index, raw in enumerate(raw_items or [], start=1):
            order_type = str(raw.get("orderType") or "raw_material").strip()
            if order_type not in ORDER_TYPES:
                raise ServiceError(f"Invalid line item type: {order_type!r}", 400)
            item_name = str(raw.get("itemName") or "").strip()
            quantity = db.as_decimal(raw.get("quantity"))
            unit_price = raw.get("unitPrice")
            unit_price = db.as_decimal(unit_price) if unit_price not in (None, "") else None
            total_price = raw.get("totalPrice")
            if total_price in (None, "") and unit_price is not None:
                total_price = quantity * unit_price
            else:
                total_price = db.as_decimal(total_price) if total_price not in (None, "") else None
            cleaned.append(
                {
                    "sr": index,
                    "order_type": order_type,
                    "item_id": raw.get("itemId") or None,
                    "item_name": item_name,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "total_price": total_price,
                }
            )
        return cleaned

    @staticmethod
    def _compute_subtotal(items: list[dict[str, Any]]) -> Decimal:
        return sum((item["total_price"] or Decimal("0")) for item in items) or Decimal("0")

    @classmethod
    def _clean_header(cls, payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        cleaned: dict[str, Any] = {}

        if "vendorId" in payload:
            cleaned["vendor_id"] = payload.get("vendorId") or None
        if "vendorName" in payload:
            cleaned["vendor_name"] = str(payload.get("vendorName") or "").strip()
        if "vendorAddress" in payload:
            cleaned["vendor_address"] = str(payload.get("vendorAddress") or "").strip() or None
        if "shipToName" in payload:
            cleaned["ship_to_name"] = str(payload.get("shipToName") or "").strip()
        if "shipToAddress" in payload:
            cleaned["ship_to_address"] = str(payload.get("shipToAddress") or "").strip() or None
        if "shipToPhone" in payload:
            cleaned["ship_to_phone"] = str(payload.get("shipToPhone") or "").strip() or None
        if "brandId" in payload:
            cleaned["brand_id"] = payload.get("brandId") or None
        if "rtqDate" in payload:
            cleaned["rtq_date"] = payload.get("rtqDate") or None
        if "termsConditions" in payload:
            cleaned["terms_conditions"] = str(payload.get("termsConditions") or "").strip() or None
        if "status" in payload:
            status = str(payload.get("status") or "draft").strip()
            if status not in STATUSES:
                raise ServiceError(f"Invalid status: {status!r}", 400)
            cleaned["status"] = status
        elif not partial:
            cleaned["status"] = "draft"

        return cleaned

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @classmethod
    def _items_by_doc(cls, doc_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        items_by_doc: dict[str, list[dict[str, Any]]] = {doc_id: [] for doc_id in doc_ids}
        if not doc_ids:
            return items_by_doc
        all_items = db.data(
            db.execute(
                db.client()
                .table(cls.ITEMS_TABLE)
                .select("*")
                .in_("request_to_quote_document_id", doc_ids)
                .order("sr")
            )
        )
        for item in all_items:
            items_by_doc.setdefault(str(item["request_to_quote_document_id"]), []).append(item)
        return items_by_doc

    @classmethod
    def list(
        cls,
        *,
        filters: dict[str, Any] | None = None,
        search: tuple[str, str] | None = None,
        order_by: str = "created_at",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        # Every save appends a new version under the same rtq_number rather
        # than editing in place, so the list view collapses each rtq_number
        # down to just its latest (highest-version) row.
        query = db.client().table(cls.TABLE).select("*")
        for key, value in (filters or {}).items():
            if value not in (None, ""):
                query = query.eq(key, value)
        query = query.order("version", desc=True)
        rows = db.data(db.execute(query))

        latest_by_number: dict[str, dict[str, Any]] = {}
        count_by_number: dict[str, int] = {}
        for row in rows:
            number = row.get("rtq_number") or ""
            count_by_number[number] = count_by_number.get(number, 0) + 1
            if number not in latest_by_number:
                latest_by_number[number] = row  # rows are ordered by version desc

        latest_rows = sorted(
            latest_by_number.values(), key=lambda r: r.get("created_at") or "", reverse=True
        )[: max(1, min(int(limit or 200), 1000))]

        items_by_doc = cls._items_by_doc([str(row["id"]) for row in latest_rows])

        result = []
        for row in latest_rows:
            doc = cls._db_to_app(row, items=items_by_doc.get(str(row["id"]), []))
            doc["versionCount"] = count_by_number.get(row.get("rtq_number") or "", 1)
            doc["isLatest"] = True
            result.append(doc)
        return result

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))
            ),
            "Request to quote not found",
        )
        return cls._db_to_app(row)

    @classmethod
    def history(cls, item_id: str) -> list[dict[str, Any]]:
        anchor = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("rtq_number").eq("id", item_id).limit(1))
            ),
            "Request to quote not found",
        )
        rows = db.data(
            db.execute(
                db.client()
                .table(cls.TABLE)
                .select("*")
                .eq("rtq_number", anchor["rtq_number"])
                .order("version", desc=True)
            )
        )
        items_by_doc = cls._items_by_doc([str(row["id"]) for row in rows])
        max_version = max((int(row.get("version") or 1) for row in rows), default=1)

        result = []
        for row in rows:
            doc = cls._db_to_app(row, items=items_by_doc.get(str(row["id"]), []))
            doc["isLatest"] = int(row.get("version") or 1) == max_version
            result.append(doc)
        return result

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        header = cls._clean_header(payload)
        if not header.get("brand_id"):
            raise ServiceError(
                "Select a brand before saving a Request to Quote — its RTQ number depends on the brand.",
                400,
            )
        items = cls._clean_items(payload.get("items"))
        header["subtotal"] = db.decimal_str(cls._compute_subtotal(items))

        created = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).insert(header))),
            "Request to quote was not saved",
            500,
        )
        doc_id = str(created["id"])
        cls._insert_items(doc_id, items)
        return cls.get(doc_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        # "Update" never edits a row in place - it appends a new version
        # under the same rtq_number, so every prior save stays intact.
        existing = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))
            ),
            "Request to quote not found",
        )
        rtq_number = existing.get("rtq_number")
        current_version = int(existing.get("version") or 1)

        latest = db.one(
            db.execute(
                db.client()
                .table(cls.TABLE)
                .select("id,version")
                .eq("rtq_number", rtq_number)
                .order("version", desc=True)
                .limit(1)
            )
        )
        if latest and str(latest.get("id")) != str(existing["id"]):
            raise ServiceError(
                "This is not the latest version of this Request to Quote. "
                "Refresh and edit the latest version instead.",
                409,
            )

        header = cls._clean_header(payload, partial=True)
        merged = {**existing, **header}

        if "items" in payload:
            items = cls._clean_items(payload.get("items"))
        else:
            # Every version is a full snapshot - carry the previous
            # version's items forward unchanged if none were supplied.
            items = [
                {
                    "sr": item["sr"],
                    "order_type": item["order_type"],
                    "item_id": item.get("item_id"),
                    "item_name": item.get("item_name") or "",
                    "quantity": db.as_decimal(item.get("quantity")),
                    "unit_price": (
                        db.as_decimal(item["unit_price"]) if item.get("unit_price") is not None else None
                    ),
                    "total_price": (
                        db.as_decimal(item["total_price"]) if item.get("total_price") is not None else None
                    ),
                }
                for item in cls._item_rows(str(existing["id"]))
            ]

        new_header = {
            "rtq_number": rtq_number,
            "version": current_version + 1,
            "vendor_id": merged.get("vendor_id"),
            "vendor_name": merged.get("vendor_name") or "",
            "vendor_address": merged.get("vendor_address"),
            "ship_to_name": merged.get("ship_to_name") or "",
            "ship_to_address": merged.get("ship_to_address"),
            "ship_to_phone": merged.get("ship_to_phone"),
            "brand_id": merged.get("brand_id"),
            "rtq_date": merged.get("rtq_date"),
            "terms_conditions": merged.get("terms_conditions"),
            "status": merged.get("status") or "draft",
            "subtotal": db.decimal_str(cls._compute_subtotal(items)),
        }

        created = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).insert(new_header))),
            "Request to quote version was not saved",
            500,
        )
        new_id = str(created["id"])
        cls._insert_items(new_id, items)
        return cls.get(new_id)

    @classmethod
    def delete(cls, item_id: str) -> None:
        # Deleting any version removes the whole rtq_number - all versions
        # together, not just the one that was clicked.
        existing = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("rtq_number").eq("id", item_id).limit(1))
            ),
            "Request to quote not found",
        )
        db.execute(db.client().table(cls.TABLE).delete().eq("rtq_number", existing["rtq_number"]))
        return None

    @classmethod
    def _insert_items(cls, rtq_document_id: str, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        rows = []
        for item in items:
            row = dict(item)
            row["request_to_quote_document_id"] = rtq_document_id
            row["quantity"] = db.decimal_str(row["quantity"])
            row["unit_price"] = db.decimal_str(row["unit_price"]) if row["unit_price"] is not None else None
            row["total_price"] = db.decimal_str(row["total_price"]) if row["total_price"] is not None else None
            rows.append(row)
        db.execute(db.client().table(cls.ITEMS_TABLE).insert(rows))


__all__ = ["RequestToQuoteService"]
