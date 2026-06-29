from __future__ import annotations

from datetime import date
from typing import Any

from .base_service import ServiceError, TableService, translate_error
from .catalog_service import BrandService, LabelService, ProductService, RawMaterialService
from .converters import payload_to_db, row_to_app, rows_to_app, to_json_value


class VendorService(TableService):
    table_name = "vendors"

    @classmethod
    def list(cls, *, filters=None, **kwargs):
        effective_filters = {"deleted": False, **(filters or {})}
        kwargs.setdefault("order_by", "name")
        kwargs.setdefault("descending", False)
        return super().list(filters=effective_filters, **kwargs)

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls._normalize(payload)
        return super().create(normalized)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get(item_id)
        return super().update(item_id, cls._normalize({**existing, **payload}))

    @classmethod
    def delete(cls, item_id: str) -> None:
        cls.update(item_id, {"deleted": True, "isActive": False})

    @staticmethod
    def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        name = str(normalized.get("name") or "").strip()
        vendor_code = str(normalized.get("vendorCode") or "").strip()
        if not name:
            raise ServiceError("Vendor name is required", 400)
        if not vendor_code:
            raise ServiceError("Vendor PO prefix is required", 400)
        normalized["name"] = name
        normalized["vendorCode"] = vendor_code
        normalized["categories"] = [
            str(item).strip()
            for item in (normalized.get("categories") or [])
            if str(item).strip()
        ]
        normalized["isActive"] = normalized.get("isActive", True) is not False
        normalized["deleted"] = normalized.get("deleted", False) is True
        normalized["whatsappSameAsPhone"] = (
            normalized.get("whatsappSameAsPhone", True) is not False
        )
        for key in (
            "shortCode",
            "email",
            "phone",
            "whatsapp",
            "country",
            "city",
            "address",
            "website",
            "paymentTerms",
            "notes",
        ):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None
        return normalized


class CompanySettingsService(TableService):
    table_name = "company_settings"

    @classmethod
    def get_current(cls) -> dict[str, Any]:
        rows = cls.list(
            order_by="created_at",
            descending=False,
            limit=1,
        )
        if rows:
            return rows[0]
        return {
            "id": None,
            "companyName": "",
            "addressLine1": "",
            "addressLine2": None,
            "city": None,
            "province": None,
            "country": None,
            "phone": None,
            "logoUrl": None,
        }

    @classmethod
    def save(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        for key in (
            "companyName",
            "addressLine1",
            "addressLine2",
            "city",
            "province",
            "country",
            "phone",
            "logoUrl",
        ):
            if key in normalized:
                value = str(normalized[key] or "").strip()
                normalized[key] = value if key in {"companyName", "addressLine1"} else value or None
        existing = cls.get_current()
        if existing.get("id"):
            return super().update(str(existing["id"]), normalized)
        return super().create(normalized)


class PurchaseOrderService(TableService):
    table_name = "purchase_orders"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "created_at")
        kwargs.setdefault("descending", True)
        return super().list(**kwargs)

    @classmethod
    def _generate_number(cls, vendor_id: str, vendor_code: str) -> str:
        try:
            response = (
                cls.client()
                .table(cls.table_name)
                .select("po_number")
                .eq("vendor_id", vendor_id)
                .like("po_number", f"{vendor_code}%")
                .order("po_number", desc=True)
                .limit(50)
                .execute()
            )
            sequence = 0
            for row in response.data or []:
                number = str(row.get("po_number") or "")
                suffix = number[len(vendor_code):] if number.startswith(vendor_code) else ""
                if suffix.isdigit():
                    sequence = max(sequence, int(suffix))
            return f"{vendor_code}{sequence + 1:02d}"
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def _build_payload(
        cls,
        payload: dict[str, Any],
        existing: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        values = {**(existing or {}), **payload}
        vendor_id = str(values.get("vendorId") or "")
        if not vendor_id:
            raise ServiceError("Vendor is required", 400)
        vendor = VendorService.get(vendor_id)
        vendor_code = str(vendor.get("vendorCode") or "").strip()
        if not vendor_code:
            raise ServiceError("Vendor PO prefix is required", 400)

        order_type = values.get("orderType")
        if order_type not in {"raw_material", "label", "product", "bottles_lids"}:
            raise ServiceError("A valid purchase-order type is required", 400)

        normalized: dict[str, Any] = {
            "vendorId": vendor_id,
            "vendorName": vendor["name"],
            "vendorCode": vendor_code,
            "orderType": order_type,
            "status": values.get("status") or "given",
            "quantity": float(values.get("quantity") or 0),
            "unit": str(values.get("unit") or "").strip() or None,
            "unitPrice": values.get("unitPrice"),
            "brandId": values.get("brandId") or None,
            "productId": values.get("productId") or None,
            "rawMaterialId": values.get("rawMaterialId") or None,
            "labelInventoryId": values.get("labelInventoryId") or None,
            "labelName": str(values.get("labelName") or "").strip() or None,
            "location": str(values.get("location") or "").strip() or None,
            "expectedDate": values.get("expectedDate") or None,
            "receivedDate": values.get("receivedDate") or None,
            "notes": str(values.get("notes") or "").strip() or None,
            "postedToInventory": existing.get("postedToInventory", False) if existing else False,
        }
        if normalized["quantity"] <= 0:
            raise ServiceError("Quantity must be greater than zero", 400)

        if normalized["unitPrice"] not in {None, ""}:
            normalized["unitPrice"] = max(0, float(normalized["unitPrice"]))
            normalized["totalAmount"] = round(
                normalized["quantity"] * normalized["unitPrice"], 4
            )
        else:
            normalized["unitPrice"] = None
            normalized["totalAmount"] = None

        item_name = str(values.get("itemName") or "").strip()
        if normalized["brandId"]:
            brand = BrandService.get(str(normalized["brandId"]))
            normalized["brandName"] = brand["name"]
        else:
            normalized["brandName"] = None
        if normalized["productId"]:
            product = ProductService.get(str(normalized["productId"]))
            normalized["productName"] = product["name"]
        else:
            normalized["productName"] = None
        if normalized["rawMaterialId"]:
            material = RawMaterialService.get(str(normalized["rawMaterialId"]))
            normalized["rawMaterialName"] = material["name"]
            normalized["rawMaterialCode"] = material["code"]
        else:
            normalized["rawMaterialName"] = None
            normalized["rawMaterialCode"] = None
        if normalized["labelInventoryId"]:
            label = LabelService.get(str(normalized["labelInventoryId"]))
            normalized.update(
                {
                    "brandId": label["brandId"],
                    "brandName": label["brandName"],
                    "productId": label["productId"],
                    "productName": label["productName"],
                    "labelName": label["labelName"],
                }
            )

        if order_type == "raw_material":
            if not normalized["rawMaterialId"]:
                raise ServiceError("Raw material is required", 400)
            item_name = normalized["rawMaterialName"]
        elif order_type == "label":
            if not normalized["brandId"] or not normalized["productId"]:
                raise ServiceError("Brand and product are required for label POs", 400)
            if not normalized["labelName"]:
                raise ServiceError("Label name is required", 400)
            item_name = normalized["labelName"]
        elif order_type == "product":
            if not normalized["brandId"] or not normalized["productId"]:
                raise ServiceError("Brand and product are required for product POs", 400)
            item_name = normalized["productName"]
        elif not item_name:
            raise ServiceError("Item name is required", 400)

        normalized["itemName"] = item_name
        return normalized

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = cls._build_payload(payload)
        normalized["poNumber"] = cls._generate_number(
            str(normalized["vendorId"]), str(normalized["vendorCode"])
        )
        created = super().create(normalized)
        if created["status"] == "received" and not created.get("postedToInventory"):
            return cls.receive(str(created["id"]))
        return created

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get(item_id)
        if existing.get("postedToInventory"):
            protected = {"quantity", "orderType", "rawMaterialId", "labelInventoryId", "productId"}
            if protected.intersection(payload):
                raise ServiceError("A received purchase order cannot change inventory fields", 409)
        normalized = cls._build_payload(payload, existing)
        normalized["poNumber"] = existing["poNumber"]
        updated = super().update(item_id, normalized)
        if updated["status"] == "received" and not updated.get("postedToInventory"):
            return cls.receive(item_id)
        return updated

    @classmethod
    def receive(cls, item_id: str) -> dict[str, Any]:
        purchase_order = cls.get(item_id)
        if purchase_order.get("postedToInventory"):
            raise ServiceError("Purchase order is already posted to inventory", 409)

        try:
            quantity = float(purchase_order.get("quantity") or 0)
            received_quantity = round(quantity)
            order_type = purchase_order.get("orderType")
            label_inventory_id = purchase_order.get("labelInventoryId")

            if order_type == "raw_material":
                raw_material_id = purchase_order.get("rawMaterialId")
                if not raw_material_id:
                    raise ServiceError(
                        "Raw material is required before receiving this PO", 400
                    )
                material = RawMaterialService.get(str(raw_material_id))
                RawMaterialService.update(
                    str(raw_material_id),
                    {"qtyKg": round(float(material.get("qtyKg") or 0) + quantity, 4)},
                )

            elif order_type == "label":
                if label_inventory_id:
                    label = LabelService.get(str(label_inventory_id))
                    LabelService.update(
                        str(label_inventory_id),
                        {
                            "quantity": max(
                                0,
                                int(label.get("quantity") or 0) + received_quantity,
                            )
                        },
                    )
                else:
                    brand_id = purchase_order.get("brandId")
                    product_id = purchase_order.get("productId")
                    brand_name = purchase_order.get("brandName")
                    product_name = purchase_order.get("productName")
                    if not brand_id or not product_id or not brand_name or not product_name:
                        raise ServiceError(
                            "Brand and product are required before receiving this label PO",
                            400,
                        )

                    desired_name = str(
                        purchase_order.get("labelName")
                        or purchase_order.get("itemName")
                        or "Standard Label"
                    ).strip()
                    labels = LabelService.list(
                        filters={
                            "brand_id": str(brand_id),
                            "product_id": str(product_id),
                        },
                        limit=500,
                    )
                    existing_label = next(
                        (
                            label
                            for label in labels
                            if str(label.get("labelName") or "").strip().lower()
                            == desired_name.lower()
                        ),
                        None,
                    )
                    if existing_label:
                        label_inventory_id = existing_label["id"]
                        LabelService.update(
                            str(label_inventory_id),
                            {
                                "quantity": max(
                                    0,
                                    int(existing_label.get("quantity") or 0)
                                    + received_quantity,
                                )
                            },
                        )
                    else:
                        created_label = LabelService.create(
                            {
                                "brandId": str(brand_id),
                                "brandName": brand_name,
                                "productId": str(product_id),
                                "productName": product_name,
                                "labelName": desired_name,
                                "quantity": received_quantity,
                                "reorderLevel": 0,
                                "notes": f"Received from PO {purchase_order['poNumber']}",
                                "isActive": True,
                            }
                        )
                        label_inventory_id = created_label["id"]

            elif order_type == "product":
                if (
                    not purchase_order.get("brandId")
                    or not purchase_order.get("productId")
                    or not purchase_order.get("brandName")
                    or not purchase_order.get("productName")
                ):
                    raise ServiceError(
                        "Brand and product are required before receiving this product PO",
                        400,
                    )
                response = (
                    cls.client()
                    .table("finished_goods")
                    .insert(
                        payload_to_db(
                            {
                                "batchId": None,
                                "brandId": purchase_order["brandId"],
                                "productId": purchase_order["productId"],
                                "batchCode": purchase_order["poNumber"],
                                "brandName": purchase_order["brandName"],
                                "productName": purchase_order["productName"],
                                "category": "bottle",
                                "name": purchase_order.get("itemName")
                                or purchase_order["productName"],
                                "location": purchase_order.get("location") or "",
                                "comments": f"Received from PO {purchase_order['poNumber']}",
                                "bottleTotal": received_quantity,
                            }
                        )
                    )
                    .execute()
                )
                if not response.data:
                    raise ServiceError("Failed to add received product inventory", 502)

            return super().update(
                item_id,
                {
                    "status": "received",
                    "postedToInventory": True,
                    "labelInventoryId": label_inventory_id,
                    "receivedDate": purchase_order.get("receivedDate")
                    or date.today().isoformat(),
                },
            )
        except ServiceError:
            raise
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def delete(cls, item_id: str) -> None:
        existing = cls.get(item_id)
        if existing.get("postedToInventory"):
            raise ServiceError(
                f"PO {existing['poNumber']} has already been received and cannot be deleted",
                409,
            )
        super().delete(item_id)


class PODocumentItemService(TableService):
    table_name = "po_document_items"


class PODocumentService(TableService):
    table_name = "po_documents"

    @classmethod
    def _with_items(cls, document: dict[str, Any]) -> dict[str, Any]:
        items = PODocumentItemService.list(
            filters={"po_document_id": document["id"]},
            order_by="sr",
            descending=False,
            limit=500,
        )
        return {**document, "items": items}

    @classmethod
    def list(cls, **kwargs):
        return [cls._with_items(item) for item in super().list(**kwargs)]

    @classmethod
    def get(cls, item_id: str):
        return cls._with_items(super().get(item_id))

    @classmethod
    def _number(cls, vendor_code: str) -> str:
        today = date.today()
        prefix = f"{vendor_code}-{str(today.year)[-2:]}{today.month:02d}-"
        try:
            response = (
                cls.client()
                .table(cls.table_name)
                .select("po_number")
                .like("po_number", f"{prefix}%")
                .order("po_number", desc=True)
                .limit(50)
                .execute()
            )
            sequence = 0
            for row in response.data or []:
                suffix = str(row.get("po_number") or "")[len(prefix):]
                if suffix.isdigit():
                    sequence = max(sequence, int(suffix))
            return f"{prefix}{sequence + 1:03d}"
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def save(cls, payload: dict[str, Any], item_id: str | None = None) -> dict[str, Any]:
        values = dict(payload)
        items = values.pop("items", None)
        if item_id:
            document = super().update(item_id, values)
        else:
            vendor_code = "PO"
            if values.get("vendorId"):
                vendor = VendorService.get(str(values["vendorId"]))
                vendor_code = str(
                    vendor.get("vendorCode") or vendor.get("shortCode") or "PO"
                ).strip().upper()
            values["poNumber"] = cls._number(vendor_code)
            values.setdefault("poDate", date.today().isoformat())
            values.setdefault("status", "draft")
            document = super().create(values)
            item_id = str(document["id"])

        if items is not None:
            try:
                cls.client().table("po_document_items").delete().eq(
                    "po_document_id", item_id
                ).execute()
                if items:
                    rows = []
                    for index, item in enumerate(items):
                        quantity = float(item.get("quantity") or 0)
                        unit_price = item.get("unitPrice")
                        unit_price = float(unit_price) if unit_price not in {None, ""} else None
                        rows.append(
                            {
                                "poDocumentId": item_id,
                                "sr": item.get("sr") or index + 1,
                                "orderType": item.get("orderType") or "raw_material",
                                "itemId": item.get("itemId") or None,
                                "itemName": item.get("itemName") or "",
                                "quantity": quantity,
                                "unitPrice": unit_price,
                                "totalPrice": round(quantity * unit_price, 4)
                                if unit_price is not None
                                else None,
                            }
                        )
                    cls.client().table("po_document_items").insert(
                        [payload_to_db(row) for row in rows]
                    ).execute()
            except Exception as error:
                raise translate_error(error) from error
        return cls.get(item_id)
