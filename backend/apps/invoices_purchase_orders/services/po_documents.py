from __future__ import annotations

from decimal import Decimal
from typing import Any

from services import db
from services.base_service import ServiceError

ORDER_TYPES = {"raw_material", "label", "product", "bottles_lids", "custom"}
STATUSES = {"draft", "sent", "received", "canceled"}


class PODocumentService:
    TABLE = "po_documents"
    ITEMS_TABLE = "po_document_items"

    # ------------------------------------------------------------------
    # Row <-> app shape
    # ------------------------------------------------------------------

    @classmethod
    def _item_rows(cls, po_document_id: str) -> list[dict[str, Any]]:
        return db.data(
            db.execute(
                db.client()
                .table(cls.ITEMS_TABLE)
                .select("*")
                .eq("po_document_id", po_document_id)
                .order("sr")
            )
        )

    @staticmethod
    def _item_to_app(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "poDocumentId": str(row["po_document_id"]),
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
            "poNumber": row.get("po_number") or "",
            "vendorId": str(row["vendor_id"]) if row.get("vendor_id") else None,
            "vendorName": row.get("vendor_name") or "",
            "vendorAddress": row.get("vendor_address"),
            "shipToName": row.get("ship_to_name") or "",
            "shipToAddress": row.get("ship_to_address"),
            "shipToPhone": row.get("ship_to_phone"),
            "brandId": str(row["brand_id"]) if row.get("brand_id") else None,
            "poDate": row.get("po_date"),
            "termsConditions": row.get("terms_conditions"),
            "status": row.get("status") or "draft",
            "subtotal": db.as_float(row.get("subtotal")),
            "gstPercent": db.as_float(row.get("gst_percent")),
            "othersPercent": db.as_float(row.get("others_percent")),
            "shippingPercent": db.as_float(row.get("shipping_percent")),
            "grandTotal": db.as_float(row.get("grand_total")),
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
    def _compute_totals(
        items: list[dict[str, Any]],
        *,
        gst_percent: Decimal,
        others_percent: Decimal,
        shipping_percent: Decimal,
    ) -> tuple[Decimal, Decimal]:
        subtotal = sum((item["total_price"] or Decimal("0")) for item in items) or Decimal("0")
        percent_total = gst_percent + others_percent + shipping_percent
        grand_total = subtotal + (subtotal * percent_total / Decimal("100"))
        return subtotal, grand_total

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
        if "poDate" in payload:
            cleaned["po_date"] = payload.get("poDate") or None
        if "termsConditions" in payload:
            cleaned["terms_conditions"] = str(payload.get("termsConditions") or "").strip() or None
        if "status" in payload:
            status = str(payload.get("status") or "draft").strip()
            if status not in STATUSES:
                raise ServiceError(f"Invalid status: {status!r}", 400)
            cleaned["status"] = status
        elif not partial:
            cleaned["status"] = "draft"

        for key, column in (
            ("gstPercent", "gst_percent"),
            ("othersPercent", "others_percent"),
            ("shippingPercent", "shipping_percent"),
        ):
            if key in payload:
                cleaned[column] = db.as_decimal(payload.get(key))
            elif not partial:
                cleaned[column] = Decimal("0")

        return cleaned

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @classmethod
    def list(
        cls,
        *,
        filters: dict[str, Any] | None = None,
        search: tuple[str, str] | None = None,
        order_by: str = "created_at",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        query = db.client().table(cls.TABLE).select("*")
        for key, value in (filters or {}).items():
            if value not in (None, ""):
                query = query.eq(key, value)
        query = query.order("created_at", desc=True).limit(max(1, min(int(limit or 200), 1000)))
        rows = db.data(db.execute(query))

        doc_ids = [str(row["id"]) for row in rows]
        items_by_doc: dict[str, list[dict[str, Any]]] = {doc_id: [] for doc_id in doc_ids}
        if doc_ids:
            all_items = db.data(
                db.execute(
                    db.client()
                    .table(cls.ITEMS_TABLE)
                    .select("*")
                    .in_("po_document_id", doc_ids)
                    .order("sr")
                )
            )
            for item in all_items:
                items_by_doc.setdefault(str(item["po_document_id"]), []).append(item)

        return [cls._db_to_app(row, items=items_by_doc.get(str(row["id"]), [])) for row in rows]

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        return cls._db_to_app(row)

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        header = cls._clean_header(payload)
        items = cls._clean_items(payload.get("items"))
        subtotal, grand_total = cls._compute_totals(
            items,
            gst_percent=header.get("gst_percent", Decimal("0")),
            others_percent=header.get("others_percent", Decimal("0")),
            shipping_percent=header.get("shipping_percent", Decimal("0")),
        )
        header["subtotal"] = db.decimal_str(subtotal)
        header["grand_total"] = db.decimal_str(grand_total)
        for percent_key in ("gst_percent", "others_percent", "shipping_percent"):
            if percent_key in header:
                header[percent_key] = db.decimal_str(header[percent_key])

        created = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).insert(header))),
            "Purchase order was not saved",
            500,
        )
        doc_id = str(created["id"])
        cls._insert_items(doc_id, items)
        return cls.get(doc_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        header = cls._clean_header(payload, partial=True)

        items = cls._clean_items(payload.get("items")) if "items" in payload else None
        if items is not None:
            gst = header.get("gst_percent", db.as_decimal(existing.get("gst_percent")))
            others = header.get("others_percent", db.as_decimal(existing.get("others_percent")))
            shipping = header.get("shipping_percent", db.as_decimal(existing.get("shipping_percent")))
            subtotal, grand_total = cls._compute_totals(
                items, gst_percent=gst, others_percent=others, shipping_percent=shipping
            )
            header["subtotal"] = db.decimal_str(subtotal)
            header["grand_total"] = db.decimal_str(grand_total)

        for percent_key in ("gst_percent", "others_percent", "shipping_percent"):
            if percent_key in header:
                header[percent_key] = db.decimal_str(header[percent_key])

        if header:
            db.execute(db.client().table(cls.TABLE).update(header).eq("id", item_id))

        if items is not None:
            db.execute(db.client().table(cls.ITEMS_TABLE).delete().eq("po_document_id", item_id))
            cls._insert_items(item_id, items)

        return cls.get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> None:
        db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("id").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        db.execute(db.client().table(cls.TABLE).delete().eq("id", item_id))
        return None

    @classmethod
    def _insert_items(cls, po_document_id: str, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        rows = []
        for item in items:
            row = dict(item)
            row["po_document_id"] = po_document_id
            row["quantity"] = db.decimal_str(row["quantity"])
            row["unit_price"] = db.decimal_str(row["unit_price"]) if row["unit_price"] is not None else None
            row["total_price"] = db.decimal_str(row["total_price"]) if row["total_price"] is not None else None
            rows.append(row)
        db.execute(db.client().table(cls.ITEMS_TABLE).insert(rows))


__all__ = ["PODocumentService"]
