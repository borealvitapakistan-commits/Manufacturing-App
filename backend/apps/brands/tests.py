from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.base_service import ServiceError, TableService
from services.catalog_service import BrandService


class BrandAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.brands.views.BrandService.list", return_value=[])
    def test_list_supports_slash_and_slashless_urls(self, mocked_list):
        self.assertEqual(self.client.get("/api/brands").status_code, 200)
        self.assertEqual(self.client.get("/api/brands/").status_code, 200)
        self.assertEqual(mocked_list.call_count, 2)

    @patch("apps.brands.views.BrandService.create")
    def test_create_validates_and_returns_resource(self, mocked_create):
        mocked_create.return_value = {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Boriel Vita",
            "codePrefix": "786",
        }
        response = self.client.post(
            "/api/brands",
            {"name": "Boriel Vita", "codePrefix": "786"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["codePrefix"], "786")


class BrandServiceTests(SimpleTestCase):
    @patch.object(TableService, "delete")
    @patch.object(BrandService, "client")
    def test_brand_with_batches_cannot_be_deleted(self, mocked_client, mocked_delete):
        response = MagicMock()
        response.data = [{"id": "batch-id"}]
        query = mocked_client.return_value.table.return_value.select.return_value
        query.eq.return_value.limit.return_value.execute.return_value = response

        with self.assertRaisesMessage(
            ServiceError,
            "Cannot delete brand with existing batches",
        ):
            BrandService.delete("brand-id")

        mocked_delete.assert_not_called()
