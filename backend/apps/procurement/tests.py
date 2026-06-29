from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.base_service import TableService
from services.catalog_service import RawMaterialService
from services.procurement_service import CompanySettingsService, PurchaseOrderService


class ProcurementAPITests(SimpleTestCase):
    vendor_id = "11111111-1111-1111-1111-111111111111"
    material_id = "22222222-2222-2222-2222-222222222222"

    def setUp(self):
        self.client = APIClient()

    @patch("apps.procurement.views.PurchaseOrderService.create")
    def test_purchase_order_create_matches_original_contract(self, mocked_create):
        mocked_create.return_value = {
            "id": self.vendor_id,
            "poNumber": "BV01",
            "status": "given",
        }
        response = self.client.post(
            "/api/purchase-orders",
            {
                "vendorId": self.vendor_id,
                "orderType": "raw_material",
                "status": "given",
                "quantity": "10.0000",
                "rawMaterialId": self.material_id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["poNumber"], "BV01")

    def test_raw_material_purchase_order_requires_positive_quantity(self):
        response = self.client.post(
            "/api/purchase-orders",
            {
                "vendorId": self.vendor_id,
                "orderType": "raw_material",
                "quantity": "0",
                "rawMaterialId": self.material_id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_vendor_requires_numeric_code_and_at_least_one_category(self):
        invalid_code = self.client.post(
            "/api/vendors",
            {
                "name": "Supplier",
                "vendorCode": "BV",
                "categories": ["raw_material_supplier"],
            },
            format="json",
        )
        missing_category = self.client.post(
            "/api/vendors",
            {
                "name": "Supplier",
                "vendorCode": "25",
                "categories": [],
            },
            format="json",
        )

        self.assertEqual(invalid_code.status_code, 400)
        self.assertEqual(missing_category.status_code, 400)

    @patch("apps.procurement.views.CompanySettingsService.get_current")
    def test_company_settings_entity_is_exposed(self, mocked_get):
        mocked_get.return_value = {
            "id": None,
            "companyName": "",
            "addressLine1": "",
        }

        response = self.client.get("/api/company-settings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["companyName"], "")


class PurchaseOrderServiceTests(SimpleTestCase):
    @patch.object(TableService, "update")
    @patch.object(RawMaterialService, "update")
    @patch.object(RawMaterialService, "get")
    @patch.object(PurchaseOrderService, "get")
    def test_receive_uses_existing_tables_without_new_rpc(
        self,
        mocked_get_po,
        mocked_get_material,
        mocked_update_material,
        mocked_update_po,
    ):
        mocked_get_po.return_value = {
            "id": "po-id",
            "poNumber": "BV01",
            "orderType": "raw_material",
            "quantity": 5,
            "rawMaterialId": "material-id",
            "postedToInventory": False,
            "receivedDate": None,
        }
        mocked_get_material.return_value = {"id": "material-id", "qtyKg": 7.5}
        mocked_update_po.return_value = {"id": "po-id", "postedToInventory": True}

        result = PurchaseOrderService.receive("po-id")

        mocked_update_material.assert_called_once_with("material-id", {"qtyKg": 12.5})
        self.assertTrue(mocked_update_po.call_args.args[1]["postedToInventory"])
        self.assertTrue(result["postedToInventory"])


class CompanySettingsServiceTests(SimpleTestCase):
    @patch.object(CompanySettingsService, "list")
    def test_empty_company_settings_returns_printable_defaults(self, mocked_list):
        mocked_list.return_value = []

        result = CompanySettingsService.get_current()

        self.assertIsNone(result["id"])
        self.assertEqual(result["companyName"], "")
