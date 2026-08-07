from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from apps.invoices_purchase_orders.services.vendors import VendorService
from services.base_service import ServiceError


class VendorAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.invoices_purchase_orders.views.vendors.VendorService.list")
    def test_vendor_list_uses_active_query_param(self, mocked_list):
        mocked_list.return_value = [{"id": "vendor-1", "name": "Acme Supplies"}]

        response = self.client.get("/api/vendors/", {"active": "true"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["name"], "Acme Supplies")
        mocked_list.assert_called_once()
        kwargs = mocked_list.call_args.kwargs
        self.assertEqual(kwargs["filters"], {"is_active": True})

    @patch("apps.invoices_purchase_orders.views.vendors.VendorService.create")
    def test_vendor_create_returns_record(self, mocked_create):
        mocked_create.return_value = {"id": "vendor-1", "name": "Acme Supplies"}

        response = self.client.post(
            "/api/vendors/",
            {
                "name": "Acme Supplies",
                "vendorCode": "25",
                "categories": ["raw_material_supplier", "manufacturer"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["name"], "Acme Supplies")
        mocked_create.assert_called_once()

    @patch("apps.invoices_purchase_orders.views.vendors.VendorService.delete")
    def test_vendor_delete_calls_service(self, mocked_delete):
        mocked_delete.return_value = None
        vendor_id = "11111111-1111-1111-1111-111111111111"

        response = self.client.delete(f"/api/vendors/{vendor_id}/")

        self.assertEqual(response.status_code, 200)
        mocked_delete.assert_called_once_with(vendor_id)


class VendorServiceValidationTests(SimpleTestCase):
    def test_missing_name_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            VendorService.normalize_payload({"vendorCode": "25", "categories": ["shop"]})
        self.assertIn("Vendor name is required", str(ctx.exception))

    def test_non_numeric_vendor_code_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            VendorService.normalize_payload(
                {"name": "Acme", "vendorCode": "AB12", "categories": ["shop"]}
            )
        self.assertIn("PO Prefix must be numeric", str(ctx.exception))

    def test_empty_categories_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            VendorService.normalize_payload({"name": "Acme", "vendorCode": "25", "categories": []})
        self.assertIn("Select at least one vendor category", str(ctx.exception))

    def test_valid_payload_normalizes_blank_optional_fields_to_none(self):
        normalized = VendorService.normalize_payload(
            {"name": " Acme ", "vendorCode": "25", "categories": ["shop"], "phone": ""}
        )
        self.assertEqual(normalized["name"], "Acme")
        self.assertIsNone(normalized["phone"])
