from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class MixingReportAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.reports.selectors.mixing.MixingService.list")
    def test_mixing_report_list_uses_mixing_selector(self, mocked_list):
        mocked_list.return_value = [{"id": "mix-1", "mixingCode": "MIX-0001"}]

        response = self.client.get("/api/reports/mixing/", {"brandId": "brand-1"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["mixingCode"], "MIX-0001")
        mocked_list.assert_called_once()
