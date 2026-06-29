from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.catalog_service import LabelService


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
