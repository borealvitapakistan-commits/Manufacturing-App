from __future__ import annotations

from decimal import Decimal
from typing import Any

from services import db
from services.base_service import ServiceError

from . import attachments
from .numbering import derive_number

ORDER_TYPES = {"raw_material", "label", "product", "bottles_lids", "custom"}
STATUSES = {"draft", "sent", "received", "canceled", "approved"}

# Excludes payment_proof_file_data - list/history queries never need the
# full base64 payload for every row, only individual get() responses do.
LIST_COLUMNS = (
    "id,po_number_seq,po_number,vendor_id,vendor_name,vendor_address,"
    "ship_to_name,ship_to_address,ship_to_phone,brand_id,po_date,"
    "terms_conditions,status,rtq_number,quote_number,subtotal,gst_percent,"
    "others_value,shipping_value,grand_total,version,payment_proof_number,"
    "payment_proof_file_name,payment_proof_file_size,payment_proof_file_type,"
    "created_at,updated_at"
)


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
    def _db_to_app(
        cls,
        row: dict[str, Any],
        *,
        items: list[dict[str, Any]] | None = None,
        include_file: bool = True,
    ) -> dict[str, Any]:
        doc_id = str(row["id"])
        if items is None:
            items = cls._item_rows(doc_id)
        return {
            "id": doc_id,
            "poNumber": row.get("po_number") or "",
            "version": int(row.get("version") or 1),
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
            "rtqNumber": row.get("rtq_number"),
            "quoteNumber": row.get("quote_number"),
            "subtotal": db.as_float(row.get("subtotal")),
            "gstPercent": db.as_float(row.get("gst_percent")),
            "othersValue": db.as_float(row.get("others_value")),
            "shippingValue": db.as_float(row.get("shipping_value")),
            "grandTotal": db.as_float(row.get("grand_total")),
            "paymentProofNumber": row.get("payment_proof_number"),
            "paymentProofFileName": row.get("payment_proof_file_name"),
            "paymentProofFileUrl": (
                attachments.data_url(row.get("payment_proof_file_data"), row.get("payment_proof_file_type"))
                if include_file
                else None
            ),
            "paymentProofFileType": row.get("payment_proof_file_type"),
            "paymentProofFileSize": (
                int(row["payment_proof_file_size"]) if row.get("payment_proof_file_size") is not None else None
            ),
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
        others_value: Decimal,
        shipping_value: Decimal,
    ) -> tuple[Decimal, Decimal]:
        # GST is a percentage of the subtotal; Others and Shipping are flat
        # dollar amounts added directly (e.g. subtotal 40 + shipping 90 = 130).
        subtotal = sum((item["total_price"] or Decimal("0")) for item in items) or Decimal("0")
        grand_total = subtotal + (subtotal * gst_percent / Decimal("100")) + others_value + shipping_value
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
            ("othersValue", "others_value"),
            ("shippingValue", "shipping_value"),
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
    def _items_by_doc(cls, doc_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        items_by_doc: dict[str, list[dict[str, Any]]] = {doc_id: [] for doc_id in doc_ids}
        if not doc_ids:
            return items_by_doc
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
        # Every save appends a new version under the same po_number rather
        # than editing in place, so the list view collapses each po_number
        # down to just its latest (highest-version) row.
        query = db.client().table(cls.TABLE).select(LIST_COLUMNS)
        for key, value in (filters or {}).items():
            if value not in (None, ""):
                query = query.eq(key, value)
        query = query.order("version", desc=True)
        rows = db.data(db.execute(query))

        latest_by_number: dict[str, dict[str, Any]] = {}
        count_by_number: dict[str, int] = {}
        for row in rows:
            number = row.get("po_number") or ""
            count_by_number[number] = count_by_number.get(number, 0) + 1
            if number not in latest_by_number:
                latest_by_number[number] = row  # rows are ordered by version desc

        latest_rows = sorted(
            latest_by_number.values(), key=lambda r: r.get("created_at") or "", reverse=True
        )[: max(1, min(int(limit or 200), 1000))]

        items_by_doc = cls._items_by_doc([str(row["id"]) for row in latest_rows])

        result = []
        for row in latest_rows:
            doc = cls._db_to_app(row, items=items_by_doc.get(str(row["id"]), []), include_file=False)
            doc["versionCount"] = count_by_number.get(row.get("po_number") or "", 1)
            doc["isLatest"] = True
            result.append(doc)
        return result

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
    def history(cls, item_id: str) -> list[dict[str, Any]]:
        anchor = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("po_number").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        rows = db.data(
            db.execute(
                db.client()
                .table(cls.TABLE)
                .select(LIST_COLUMNS)
                .eq("po_number", anchor["po_number"])
                .order("version", desc=True)
            )
        )
        items_by_doc = cls._items_by_doc([str(row["id"]) for row in rows])
        max_version = max((int(row.get("version") or 1) for row in rows), default=1)

        result = []
        for row in rows:
            doc = cls._db_to_app(row, items=items_by_doc.get(str(row["id"]), []), include_file=False)
            doc["isLatest"] = int(row.get("version") or 1) == max_version
            result.append(doc)
        return result

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        header = cls._clean_header(payload)

        # Linking a PO to a Request to Quote is optional (ad-hoc POs with no
        # RTQ keep working unchanged) - but a Quote must already exist for
        # that RTQ, since Quote is the step between RTQ and PO in the
        # documented procurement flow.
        rtq_number = str(payload.get("rtqNumber") or "").strip() or None
        if rtq_number:
            quote = db.one(
                db.execute(
                    db.client()
                    .table("quotes")
                    .select("quote_number")
                    .eq("rtq_number", rtq_number)
                    .limit(1)
                )
            )
            if not quote:
                raise ServiceError(
                    "Create a Quote for this Request to Quote before creating a Purchase Order from it.",
                    409,
                )
            header["rtq_number"] = rtq_number
            header["quote_number"] = quote.get("quote_number")
            # The PO number always traces back to its Request to Quote -
            # BOR-RTQ-004 -> BOR-PO-004 - rather than an independent
            # sequence. Ad-hoc POs (no rtq_number) keep the independent
            # per-brand sequence assigned by the assign_po_number() trigger.
            header["po_number"] = derive_number(rtq_number, "RTQ", "PO", label="Purchase Order")

        if not header.get("brand_id"):
            raise ServiceError(
                "Select a brand before saving a Purchase Order — its PO number depends on the brand.",
                400,
            )
        items = cls._clean_items(payload.get("items"))
        subtotal, grand_total = cls._compute_totals(
            items,
            gst_percent=header.get("gst_percent", Decimal("0")),
            others_value=header.get("others_value", Decimal("0")),
            shipping_value=header.get("shipping_value", Decimal("0")),
        )
        header["subtotal"] = db.decimal_str(subtotal)
        header["grand_total"] = db.decimal_str(grand_total)
        for money_key in ("gst_percent", "others_value", "shipping_value"):
            if money_key in header:
                header[money_key] = db.decimal_str(header[money_key])

        created = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).insert(header))),
            "Purchase order was not saved",
            500,
        )
        doc_id = str(created["id"])
        cls._insert_items(doc_id, items)

        if rtq_number:
            # Not a new RTQ version - status isn't part of the version
            # snapshot, same in-place update approve() used to do. Applies
            # to every version row sharing this rtq_number, matching how
            # delete() already treats "by number" operations as version-wide.
            db.execute(
                db.client()
                .table("request_to_quote_documents")
                .update({"status": "moved_to_po"})
                .eq("rtq_number", rtq_number)
            )

        return cls.get(doc_id)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        # "Update" never edits a row in place - it appends a new version
        # under the same po_number, so every prior save stays intact.
        existing = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        if existing.get("status") == "approved":
            raise ServiceError(
                "This purchase order is approved and can no longer be edited.", 409
            )

        po_number = existing.get("po_number")
        current_version = int(existing.get("version") or 1)

        latest = db.one(
            db.execute(
                db.client()
                .table(cls.TABLE)
                .select("id,version")
                .eq("po_number", po_number)
                .order("version", desc=True)
                .limit(1)
            )
        )
        if latest and str(latest.get("id")) != str(existing["id"]):
            raise ServiceError(
                "This is not the latest version of this Purchase Order. "
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

        gst = db.as_decimal(merged.get("gst_percent"))
        others = db.as_decimal(merged.get("others_value"))
        shipping = db.as_decimal(merged.get("shipping_value"))
        subtotal, grand_total = cls._compute_totals(
            items, gst_percent=gst, others_value=others, shipping_value=shipping
        )

        new_header = {
            "po_number": po_number,
            "version": current_version + 1,
            "rtq_number": existing.get("rtq_number"),
            "quote_number": existing.get("quote_number"),
            "payment_proof_number": existing.get("payment_proof_number"),
            "payment_proof_file_name": existing.get("payment_proof_file_name"),
            "payment_proof_file_data": existing.get("payment_proof_file_data"),
            "payment_proof_file_size": existing.get("payment_proof_file_size"),
            "payment_proof_file_type": existing.get("payment_proof_file_type"),
            "vendor_id": merged.get("vendor_id"),
            "vendor_name": merged.get("vendor_name") or "",
            "vendor_address": merged.get("vendor_address"),
            "ship_to_name": merged.get("ship_to_name") or "",
            "ship_to_address": merged.get("ship_to_address"),
            "ship_to_phone": merged.get("ship_to_phone"),
            "brand_id": merged.get("brand_id"),
            "po_date": merged.get("po_date"),
            "terms_conditions": merged.get("terms_conditions"),
            "status": merged.get("status") or "draft",
            "gst_percent": db.decimal_str(gst),
            "others_value": db.decimal_str(others),
            "shipping_value": db.decimal_str(shipping),
            "subtotal": db.decimal_str(subtotal),
            "grand_total": db.decimal_str(grand_total),
        }

        created = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).insert(new_header))),
            "Purchase order version was not saved",
            500,
        )
        new_id = str(created["id"])
        cls._insert_items(new_id, items)
        return cls.get(new_id)

    @classmethod
    def set_payment_proof(cls, item_id: str, file: Any) -> dict[str, Any]:
        """Attaches (or replaces) the Payment Proof file on this exact PO
        row - in place, not as a new version, since it's supplementary
        evidence rather than a content edit.
        """
        existing = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("po_number").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        if not file:
            raise ServiceError("Attach a file before saving Payment Proof.", 400)

        # BOR-PO-004 -> BOR-PO-PP-004.
        payment_proof_number = derive_number(existing.get("po_number"), "PO", "PO-PP", label="Payment Proof")
        changes = {
            "payment_proof_number": payment_proof_number,
            "payment_proof_file_name": attachments.renamed(file, payment_proof_number),
            "payment_proof_file_data": attachments.encode(file),
            "payment_proof_file_size": file.size,
            "payment_proof_file_type": getattr(file, "content_type", None),
        }
        db.execute(db.client().table(cls.TABLE).update(changes).eq("id", item_id))
        return cls.get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> None:
        # Deleting any version removes the whole po_number - all versions
        # together, not just the one that was clicked.
        existing = db.require_row(
            db.one(
                db.execute(db.client().table(cls.TABLE).select("po_number").eq("id", item_id).limit(1))
            ),
            "Purchase order not found",
        )
        db.execute(db.client().table(cls.TABLE).delete().eq("po_number", existing["po_number"]))
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
