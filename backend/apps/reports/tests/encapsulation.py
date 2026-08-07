from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class EncapsulationReportAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.reports.selectors.encapsulation.EncapsulationService.list")
    def test_encapsulation_report_list_uses_selector(self, mocked_list):
        mocked_list.return_value = [
            {
                "id": "encapsulation-1",
                "encapsulationCode": "E-ASH-001",
                "njpCode": "E-ASH-001",
            }
        ]

        response = self.client.get("/api/reports/encapsulation/", {"productId": "product-1"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["encapsulationCode"], "E-ASH-001")
        mocked_list.assert_called_once()
