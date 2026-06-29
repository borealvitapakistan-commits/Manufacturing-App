from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.batch_service import BatchService
from services.catalog_service import ProductService
from services.pricing_service import BatchPricingService


class BatchPricingServiceTests(SimpleTestCase):
    @patch.object(ProductService, "get")
    @patch.object(BatchService, "get")
    @patch.object(BatchService, "client")
    def test_original_batch_pricing_formula_runs_on_server(
        self,
        mocked_client,
        mocked_batch,
        mocked_product,
    ):
        mocked_batch.return_value = {
            "id": "batch-id",
            "productId": "product-id",
            "containerCount": 100,
            "unitsPerContainer": 60,
        }
        mocked_product.return_value = {
            "id": "product-id",
            "rm": [
                {
                    "rawMaterialId": "material-id",
                    "rawMaterial": "Zinc",
                    "labelClaim": "100 mg",
                }
            ],
        }
        response = SimpleNamespace(
            data=[
                {
                    "id": "material-id",
                    "code": "RM-ZIN",
                    "name": "Zinc",
                    "price_per_kg": 10,
                }
            ]
        )
        mocked_client.return_value.table.return_value.select.return_value.execute.return_value = response

        result = BatchPricingService.calculate(
            "batch-id",
            {
                "capsPricePer75000": 750,
                "bottleUnitCost": 0.5,
                "lidUnitCost": 0.1,
                "labelUnitCost": 0.15,
                "labourCost": 25,
                "cadRate": 1.35,
            },
        )

        self.assertEqual(result["totalCapsulesNeeded"], 6000)
        self.assertEqual(result["rawMaterialCost"], 6)
        self.assertEqual(result["packagingCost"], 135)
        self.assertEqual(result["grandTotal"], 166)
        self.assertEqual(result["grandTotalCAD"], 224.1)
