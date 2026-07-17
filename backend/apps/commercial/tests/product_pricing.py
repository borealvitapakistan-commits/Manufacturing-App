from unittest.mock import patch

from django.test import SimpleTestCase

from apps.commercial.services.products import ProductService
from apps.inventory.services.raw_materials import RawMaterialService
from apps.commercial.services.product_pricing import ProductPricingService


class FakeRateResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b'{"date":"2026-07-11","rates":{"CAD":1.372519}}'


class ProductPricingServiceTests(SimpleTestCase):
    @patch.object(ProductService, "get")
    @patch.object(RawMaterialService, "list")
    def test_product_pricing_formula_uses_product_formula(
        self,
        mocked_raw_materials,
        mocked_product,
    ):
        mocked_product.return_value = {
            "id": "product-id",
            "name": "Calcium Capsule",
            "rm": [
                {
                    "rawMaterialId": "material-id",
                    "rawMaterial": "Calcium",
                    "labelClaim": "250 mg",
                }
            ],
        }
        mocked_raw_materials.return_value = [
            {
                "id": "material-id",
                "code": "RM-CAL",
                "name": "Calcium",
                "price_per_kg": 20,
            }
        ]

        result = ProductPricingService.calculate_for_product(
            "product-id",
            {
                "unitsPerContainer": 120,
                "containerCount": 100,
                "capsPricePer75000": 750,
                "bottleUnitCost": 0.5,
                "lidUnitCost": 0.1,
                "labelUnitCost": 0.15,
                "cadRate": 1.35,
            },
        )

        self.assertEqual(result["totalUnits"], 12000)
        self.assertEqual(result["pricingLines"][0]["requiredKg"], 3)
        self.assertEqual(result["rawMaterialCost"], 60)
        self.assertEqual(result["packagingCost"], 195)
        self.assertEqual(result["grandTotal"], 255)
        self.assertEqual(result["costPerContainer"], 2.55)
        self.assertEqual(result["grandTotalCAD"], 344.25)

    @patch("apps.commercial.services.product_pricing.urlopen")
    def test_current_cad_rate_uses_currency_api_response(self, mocked_urlopen):
        mocked_urlopen.return_value = FakeRateResponse()

        result = ProductPricingService.current_cad_rate()

        self.assertEqual(result["base"], "USD")
        self.assertEqual(result["target"], "CAD")
        self.assertEqual(result["rate"], 1.372519)
        self.assertEqual(result["date"], "2026-07-11")
        self.assertEqual(result["source"], "frankfurter.app")
