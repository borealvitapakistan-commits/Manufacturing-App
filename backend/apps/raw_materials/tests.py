from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.base_service import ServiceError, TableService
from services.catalog_service import RawMaterialService


class RawMaterialServiceTests(SimpleTestCase):
    @patch.object(TableService, "delete")
    @patch.object(RawMaterialService, "client")
    def test_material_used_in_product_formula_cannot_be_deleted(
        self,
        mocked_client,
        mocked_delete,
    ):
        response = MagicMock()
        response.data = [
            {
                "id": "product-id",
                "rm": [{"rawMaterialId": "material-id"}],
            }
        ]
        query = mocked_client.return_value.table.return_value.select.return_value
        query.execute.return_value = response

        with self.assertRaisesMessage(
            ServiceError,
            "Cannot delete raw material used in products",
        ):
            RawMaterialService.delete("material-id")

        mocked_delete.assert_not_called()

    @patch.object(RawMaterialService, "client")
    def test_low_stock_includes_items_equal_to_threshold(self, mocked_client):
        response = MagicMock()
        response.data = [{"id": "material-id", "name": "Zinc", "qty_kg": 10}]
        table = mocked_client.return_value.table.return_value
        table.select.return_value.lte.return_value.order.return_value.execute.return_value = response

        result = RawMaterialService.low_stock(10)

        table.select.return_value.lte.assert_called_once_with("qty_kg", 10)
        self.assertEqual(result[0]["qty"], 10)
