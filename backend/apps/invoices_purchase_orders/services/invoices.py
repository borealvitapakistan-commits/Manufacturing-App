from __future__ import annotations

from typing import Any

from services import db
from services.base_service import ServiceError

from . import attachments
from .numbering import derive_number

# Excludes file_data - list queries never need the full base64 payload for
# every row, only individual get()/create()/update() responses do.
LIST_COLUMNS = "id,invoice_number,po_number,brand_id,file_name,file_type,file_size,comments,created_at,updated_at"


class InvoiceService:
    TABLE = "invoices"

    # ------------------------------------------------------------------
    # Row <-> app shape
    # ------------------------------------------------------------------

    @classmethod
    def _db_to_app(cls, row: dict[str, Any], *, include_file: bool = True) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "invoiceNumber": row.get("invoice_number") or "",
            "poNumber": row.get("po_number") or "",
            "brandId": str(row["brand_id"]) if row.get("brand_id") else None,
            "fileName": row.get("file_name"),
            "fileUrl": attachments.data_url(row.get("file_data"), row.get("file_type")) if include_file else None,
            "fileType": row.get("file_type"),
            "fileSize": int(row["file_size"]) if row.get("file_size") is not None else None,
            "comments": row.get("comments"),
            "createdAt": db.timestamp_ms(row.get("created_at")),
            "updatedAt": db.timestamp_ms(row.get("updated_at")),
        }

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
        query = db.client().table(cls.TABLE).select(LIST_COLUMNS)
        for key, value in (filters or {}).items():
            if value not in (None, ""):
                query = query.eq(key, value)
        query = query.order(order_by, desc=True).limit(max(1, min(int(limit or 200), 1000)))
        rows = db.data(db.execute(query))
        return [cls._db_to_app(row, include_file=False) for row in rows]

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        row = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).select("*").eq("id", item_id).limit(1))),
            "Invoice not found",
        )
        return cls._db_to_app(row)

    @staticmethod
    def _latest_po(po_number: str) -> dict[str, Any]:
        row = db.one(
            db.execute(
                db.client()
                .table("po_documents")
                .select("*")
                .eq("po_number", po_number)
                .order("version", desc=True)
                .limit(1)
            )
        )
        if not row:
            raise ServiceError("Purchase order not found", 404)
        return row

    @classmethod
    def create(cls, payload: dict[str, Any], file: Any) -> dict[str, Any]:
        po_number = str(payload.get("poNumber") or "").strip()
        if not po_number:
            raise ServiceError("Select a Purchase Order before saving an Invoice.", 400)
        if not file:
            raise ServiceError("Attach a file before saving an Invoice.", 400)

        existing = db.one(
            db.execute(
                db.client().table(cls.TABLE).select("id").eq("po_number", po_number).limit(1)
            )
        )
        if existing:
            raise ServiceError("This Purchase Order already has an Invoice attached.", 409)

        po = cls._latest_po(po_number)
        brand_id = po.get("brand_id")
        if not brand_id:
            raise ServiceError(
                "This Purchase Order has no brand assigned - its Invoice number depends on the brand.",
                400,
            )

        # The Invoice number always traces back to its Purchase Order -
        # BOR-PO-004 -> BOR-INV-004 - rather than an independent sequence.
        invoice_number = derive_number(po_number, "PO", "INV", label="Invoice")

        header = {
            "invoice_number": invoice_number,
            "po_number": po_number,
            "brand_id": brand_id,
            "file_name": attachments.renamed(file, invoice_number),
            "file_data": attachments.encode(file),
            "file_size": file.size,
            "file_type": getattr(file, "content_type", None),
            "comments": str(payload.get("comments") or "").strip() or None,
        }
        created = db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).insert(header))),
            "Invoice was not saved",
            500,
        )
        return cls._db_to_app(created)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any], file: Any = None) -> dict[str, Any]:
        existing = db.require_row(
            db.one(
                db.execute(
                    db.client().table(cls.TABLE).select("id,invoice_number").eq("id", item_id).limit(1)
                )
            ),
            "Invoice not found",
        )
        changes: dict[str, Any] = {}
        if "comments" in payload:
            changes["comments"] = str(payload.get("comments") or "").strip() or None
        if file:
            # A replacement file keeps the Invoice's own number - it never
            # changes after creation.
            changes.update(
                file_name=attachments.renamed(file, existing["invoice_number"]),
                file_data=attachments.encode(file),
                file_size=file.size,
                file_type=getattr(file, "content_type", None),
            )

        if not changes:
            return cls.get(str(existing["id"]))

        db.execute(db.client().table(cls.TABLE).update(changes).eq("id", item_id))
        return cls.get(item_id)

    @classmethod
    def delete(cls, item_id: str) -> None:
        db.require_row(
            db.one(db.execute(db.client().table(cls.TABLE).select("id").eq("id", item_id).limit(1))),
            "Invoice not found",
        )
        db.execute(db.client().table(cls.TABLE).delete().eq("id", item_id))


__all__ = ["InvoiceService"]
