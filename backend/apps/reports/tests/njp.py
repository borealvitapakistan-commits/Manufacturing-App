from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class NJPReportAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.reports.selectors.njp.NJPService.list")
    def test_njp_report_list_uses_njp_selector(self, mocked_list):
        mocked_list.return_value = [{"id": "njp-1", "njpCode": "NJP-0001"}]

        response = self.client.get("/api/reports/njp/", {"productId": "product-1"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["njpCode"], "NJP-0001")
        mocked_list.assert_called_once()
