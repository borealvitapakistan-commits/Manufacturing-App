from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class AssemblyReportAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.reports.selectors.assembly.AssemblyService.list")
    def test_assembly_report_list_uses_assembly_selector(self, mocked_list):
        mocked_list.return_value = [{"id": "asm-1", "batchCode": "786001"}]

        response = self.client.get("/api/reports/assembly/", {"njpId": "njp-1"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["batchCode"], "786001")
        mocked_list.assert_called_once()
