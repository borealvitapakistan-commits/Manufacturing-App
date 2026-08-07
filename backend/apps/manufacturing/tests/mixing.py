from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from apps.manufacturing.services.mixing.rules import MixingRules


class MixingAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.manufacturing.views.mixing.MixingService.list")
    def test_mixing_list_uses_manufacturing_service_filters(self, mocked_list):
        mocked_list.return_value = [{"id": "mix-1", "mixingCode": "MIX-0001"}]

        response = self.client.get(
            "/api/manufacturing/mixing/",
            {"brandId": "brand-1", "productId": "product-1", "search": "ash"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["mixingCode"], "MIX-0001")
        mocked_list.assert_called_once()
        kwargs = mocked_list.call_args.kwargs
        self.assertEqual(kwargs["brand_id"], "brand-1")
        self.assertEqual(kwargs["product_id"], "product-1")
        self.assertEqual(kwargs["search"], "ash")

    @patch("apps.manufacturing.views.mixing.MixingService.create")
    def test_mixing_create_validates_and_returns_record(self, mocked_create):
        mocked_create.return_value = {"id": "mix-1", "mixingCode": "MIX-0001"}

        response = self.client.post(
            "/api/manufacturing/mixing/",
            {
                "brandId": "brand-1",
                "productId": "product-1",
                "productName": "Ashwagandha",
                "totalKgInMixing": "10.0000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["mixingCode"], "MIX-0001")
        mocked_create.assert_called_once()


class MixingCodeRulesTests(SimpleTestCase):
    def test_product_mixing_code_uses_product_prefix_and_global_sequence(self):
        products = [
            {"id": "ber", "productName": "Berberine"},
            {"id": "cit", "productName": "Magnesium Citrate"},
            {"id": "gly", "productName": "Magnesium Gyemate"},
        ]
        records = [
            {"mixingCode": "M-BER-001"},
            {"mixingCode": "M-MAC-002"},
        ]

        self.assertEqual(
            MixingRules._next_code(
                records,
                product={"id": "ber", "productName": "Berberine"},
                products=products,
            ),
            "M-BER-003",
        )
        self.assertEqual(
            MixingRules._format_mixing_code(
                product={"id": "cit", "productName": "Magnesium Citrate"},
                number=4,
                products=products,
            ),
            "M-MAC-004",
        )
        self.assertEqual(
            MixingRules._format_mixing_code(
                product={"id": "gly", "productName": "Magnesium Gyemate"},
                number=5,
                products=products,
            ),
            "M-MAG-005",
        )
