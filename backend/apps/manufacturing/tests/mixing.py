from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class MixingAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.manufacturing.views.mixing.MixingService.list")
    def test_mixing_list_uses_manufacturing_service_filters(self, mocked_list):
        mocked_list.return_value = [{"id": "mix-1", "mixingCode": "MIX-0001"}]

        response = self.client.get(
            "/api/mixing/",
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
            "/api/mixing/",
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
