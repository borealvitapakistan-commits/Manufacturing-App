from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class DashboardAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.dashboard.views.BatchService.count", return_value=1)
    @patch("apps.dashboard.views.RawMaterialService.count", return_value=1)
    @patch("apps.dashboard.views.ProductService.count", return_value=1)
    @patch("apps.dashboard.views.BrandService.count", return_value=1)
    def test_dashboard_root_returns_stats(
        self,
        mocked_brand_count,
        mocked_product_count,
        mocked_raw_count,
        mocked_batch_count,
    ):
        response = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["brands"], 1)
        self.assertEqual(payload["activeBatches"], 3)
        self.assertEqual(payload["finalizedBatches"], 1)
