from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from apps.invoices_purchase_orders.services.sent_items import SentItemService
from services.base_service import ServiceError


class SentItemAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.invoices_purchase_orders.views.sent_items.SentItemService.list")
    def test_sent_item_list_uses_filters(self, mocked_list):
        mocked_list.return_value = [{"id": "sent-1", "itemName": "Magnesium Glycinate"}]

        response = self.client.get(
            "/api/sent-items/",
            {"vendorId": "vendor-1", "brandId": "brand-1", "itemType": "assembly"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["itemName"], "Magnesium Glycinate")
        kwargs = mocked_list.call_args.kwargs
        self.assertEqual(kwargs["vendor_id"], "vendor-1")
        self.assertEqual(kwargs["brand_id"], "brand-1")
        self.assertEqual(kwargs["item_type"], "assembly")

    @patch("apps.invoices_purchase_orders.views.sent_items.SentItemService.create")
    def test_sent_item_create_returns_record(self, mocked_create):
        mocked_create.return_value = {"id": "sent-1", "itemName": "Magnesium Glycinate"}

        response = self.client.post(
            "/api/sent-items/",
            {
                "vendorId": "vendor-1",
                "brandId": "brand-1",
                "itemType": "assembly",
                "sourceId": "lot-1",
                "quantity": 40,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        mocked_create.assert_called_once()

    @patch("apps.invoices_purchase_orders.views.sent_items.SentItemService.list_sources")
    def test_sent_item_sources_view(self, mocked_list_sources):
        mocked_list_sources.return_value = [{"id": "lot-1", "label": "A-786-001 (50 available)"}]

        response = self.client.get("/api/sent-items/sources/", {"itemType": "assembly", "brandId": "brand-1"})

        self.assertEqual(response.status_code, 200)
        mocked_list_sources.assert_called_once_with("assembly", "brand-1")

    @patch("apps.invoices_purchase_orders.views.sent_items.SentItemService.delete")
    def test_sent_item_delete_calls_service(self, mocked_delete):
        mocked_delete.return_value = {"success": True}
        sent_item_id = "22222222-2222-2222-2222-222222222222"

        response = self.client.delete(f"/api/sent-items/{sent_item_id}/")

        self.assertEqual(response.status_code, 200)
        mocked_delete.assert_called_once_with(sent_item_id)


class SentItemValidationTests(SimpleTestCase):
    @patch.object(SentItemService, "resolve_source")
    def test_correct_quantity_validation_within_available(self, mocked_resolve):
        mocked_resolve.return_value = {
            "inventoryItemId": "inv-1",
            "itemName": "Magnesium Glycinate",
            "itemCode": "A-786-001",
            "availableQty": 100,
        }
        resolved = SentItemService._validate_payload(
            {
                "vendorId": "vendor-1",
                "brandId": "brand-1",
                "itemType": "assembly",
                "sourceId": "lot-1",
                "quantity": 40,
            }
        )
        self.assertEqual(resolved["quantity"], 40)
        self.assertEqual(resolved["inventoryItemId"], "inv-1")
        self.assertEqual(resolved["itemCode"], "A-786-001")

    @patch.object(SentItemService, "resolve_source")
    def test_quantity_exceeding_available_rejected(self, mocked_resolve):
        mocked_resolve.return_value = {
            "inventoryItemId": "inv-1",
            "itemName": "Magnesium Glycinate",
            "itemCode": "A-786-001",
            "availableQty": 30,
        }
        with self.assertRaises(ServiceError) as ctx:
            SentItemService._validate_payload(
                {
                    "vendorId": "vendor-1",
                    "brandId": "brand-1",
                    "itemType": "assembly",
                    "sourceId": "lot-1",
                    "quantity": 40,
                }
            )
        self.assertIn("Not enough quantity available", str(ctx.exception))

    def test_zero_quantity_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            SentItemService._validate_payload(
                {
                    "vendorId": "vendor-1",
                    "brandId": "brand-1",
                    "itemType": "assembly",
                    "sourceId": "lot-1",
                    "quantity": 0,
                }
            )
        self.assertIn("greater than zero", str(ctx.exception))

    def test_missing_vendor_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            SentItemService._validate_payload(
                {"brandId": "brand-1", "itemType": "assembly", "sourceId": "lot-1", "quantity": 10}
            )
        self.assertIn("Select the vendor", str(ctx.exception))

    def test_missing_brand_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            SentItemService._validate_payload(
                {"vendorId": "vendor-1", "itemType": "assembly", "sourceId": "lot-1", "quantity": 10}
            )
        self.assertIn("Select the brand", str(ctx.exception))

    def test_invalid_item_type_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            SentItemService._validate_payload(
                {
                    "vendorId": "vendor-1",
                    "brandId": "brand-1",
                    "itemType": "not_a_real_type",
                    "sourceId": "lot-1",
                    "quantity": 10,
                }
            )
        self.assertIn("Select what type of item", str(ctx.exception))

    def test_missing_source_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            SentItemService._validate_payload(
                {"vendorId": "vendor-1", "brandId": "brand-1", "itemType": "assembly", "quantity": 10}
            )
        self.assertIn("Select which record", str(ctx.exception))

    def test_unknown_item_type_in_resolve_source_rejected(self):
        with self.assertRaises(ServiceError):
            SentItemService.resolve_source("not_a_real_type", "some-id")

    def test_unknown_item_type_in_list_sources_rejected(self):
        with self.assertRaises(ServiceError):
            SentItemService.list_sources("not_a_real_type")
