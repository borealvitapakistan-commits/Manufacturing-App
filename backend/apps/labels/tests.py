from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.base_service import ServiceError, TableService
from services.catalog_service import BrandService, LabelService, ProductService


class LabelServiceTests(SimpleTestCase):
    @patch.object(LabelService, "client")
    def test_validation_sums_all_active_label_inventory_rows(self, mocked_client):
        response = MagicMock()
        response.data = [{"quantity": 40}, {"quantity": 35}, {"quantity": -5}]
        query = mocked_client.return_value.table.return_value.select.return_value
        query.eq.return_value.eq.return_value.eq.return_value.execute.return_value = response

        result = LabelService.validate("brand-id", "product-id", 80)

        self.assertEqual(result["available"], 75)
        self.assertEqual(result["shortage"], 5)
        self.assertTrue(result["hasShortage"])

    def test_label_create_saves_type_and_dosage_type(self):
        with (
            patch.object(BrandService, "get", return_value={"name": "Brand"}),
            patch.object(ProductService, "get", return_value={"name": "Product"}),
            patch.object(TableService, "create", return_value={"id": "label-id"}) as mocked_create,
        ):
            LabelService.create(
                {
                    "brandId": "11111111-1111-1111-1111-111111111111",
                    "productId": "22222222-2222-2222-2222-222222222222",
                    "type": "tablets",
                    "dosageType": "120",
                    "labelName": "Bottle Label",
                    "quantity": 10,
                }
            )

        payload = mocked_create.call_args.args[0]
        self.assertEqual(payload["type"], "tablets")
        self.assertEqual(payload["dosageType"], "120")

    def test_label_create_defaults_type_and_dosage_type(self):
        with (
            patch.object(BrandService, "get", return_value={"name": "Brand"}),
            patch.object(ProductService, "get", return_value={"name": "Product"}),
            patch.object(TableService, "create", return_value={"id": "label-id"}) as mocked_create,
        ):
            LabelService.create(
                {
                    "brandId": "11111111-1111-1111-1111-111111111111",
                    "productId": "22222222-2222-2222-2222-222222222222",
                    "quantity": 10,
                }
            )

        payload = mocked_create.call_args.args[0]
        self.assertEqual(payload["type"], "capsule")
        self.assertEqual(payload["dosageType"], "60")

    def test_invalid_label_type_is_rejected(self):
        with self.assertRaisesMessage(ServiceError, "Invalid label type"):
            LabelService.create(
                {
                    "brandId": "11111111-1111-1111-1111-111111111111",
                    "productId": "22222222-2222-2222-2222-222222222222",
                    "type": "cream",
                    "quantity": 10,
                }
            )
