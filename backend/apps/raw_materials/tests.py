from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.base_service import ServiceError, TableService
from services.catalog_service import RawMaterialCategoryService, RawMaterialService


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

    @patch.object(TableService, "create", return_value={"id": "material-id", "qtyKg": 1})
    @patch.object(RawMaterialCategoryService, "get", return_value={"id": "category-id", "name": "Herbs"})
    def test_create_saves_selected_category_id_and_name(self, mocked_category, mocked_create):
        RawMaterialService.create(
            {
                "name": "Ashwagandha",
                "qty": 1,
                "pricePerKg": 10,
                "categoryId": "category-id",
            }
        )

        payload = mocked_create.call_args.args[0]
        self.assertEqual(payload["categoryId"], "category-id")
        self.assertEqual(payload["category"], "Herbs")

    @patch.object(TableService, "create", return_value={"id": "material-id", "qtyKg": 1})
    @patch.object(RawMaterialCategoryService, "get", return_value={"id": "other-id", "name": "Other"})
    @patch.object(RawMaterialCategoryService, "get_other_category_id", return_value="other-id")
    def test_create_defaults_to_other_category(self, mocked_other, mocked_category, mocked_create):
        RawMaterialService.create({"name": "Unsorted", "qty": 1, "pricePerKg": 10})

        payload = mocked_create.call_args.args[0]
        self.assertEqual(payload["categoryId"], "other-id")
        self.assertEqual(payload["category"], "Other")

    @patch.object(TableService, "delete")
    @patch.object(RawMaterialCategoryService, "client")
    def test_category_used_by_material_cannot_be_deleted(self, mocked_client, mocked_delete):
        response = MagicMock()
        response.data = [{"id": "material-id"}]
        query = mocked_client.return_value.table.return_value.select.return_value
        query.eq.return_value.limit.return_value.execute.return_value = response

        with self.assertRaisesMessage(
            ServiceError,
            "Cannot delete category used by raw materials",
        ):
            RawMaterialCategoryService.delete("category-id")

        mocked_delete.assert_not_called()
