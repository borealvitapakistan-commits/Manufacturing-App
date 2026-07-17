from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.base_service import ServiceError
from apps.commercial.services.brands import BrandService


class BrandAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.commercial.views.brands.BrandService.list", return_value=[])
    def test_list_supports_slash_and_slashless_urls(self, mocked_list):
        self.assertEqual(self.client.get("/api/brands").status_code, 200)
        self.assertEqual(self.client.get("/api/brands/").status_code, 200)
        self.assertEqual(mocked_list.call_count, 2)

    @patch("apps.commercial.views.brands.BrandService.create")
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
    @patch("apps.commercial.services.brands.db.client")
    @patch("apps.commercial.services.brands.db.execute")
    @patch("apps.commercial.services.brands.db.one", return_value={"id": "mix-1"})
    def test_brand_with_manufacturing_records_cannot_be_deleted(
        self,
        mocked_one,
        mocked_execute,
        mocked_client,
    ):
        with self.assertRaisesMessage(
            ServiceError,
            "Cannot delete brand with existing manufacturing or inventory records",
        ):
            BrandService.delete("brand-id")
