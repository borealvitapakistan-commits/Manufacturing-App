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
    def test_brand_profile_columns_map_to_api_fields(self):
        row = {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Paragon Health Foods",
            "code_prefix": "786",
            "short_name": "PHF",
            "contact_name": "Purchase Manager",
            "contact_email": "purchase@example.com",
            "contact_phone": "0321-7557444",
            "address": "legacy address",
            "address_line_1": "Street 1",
            "address_line_2": "Suite 2",
            "city": "Lahore",
            "province": "Punjab",
            "country": "Pakistan",
            "logo_url": "https://example.com/logo.png",
            "brand_color": "#55a216",
            "notes": "PO brand",
            "is_active": True,
            "created_at": None,
            "updated_at": None,
            "metadata": {},
        }

        brand = BrandService._db_to_app(row)

        self.assertEqual(brand["shortName"], "PHF")
        self.assertEqual(brand["contactName"], "Purchase Manager")
        self.assertEqual(brand["contactEmail"], "purchase@example.com")
        self.assertEqual(brand["addressLine1"], "Street 1")
        self.assertEqual(brand["addressLine2"], "Suite 2")
        self.assertEqual(brand["city"], "Lahore")
        self.assertEqual(brand["province"], "Punjab")
        self.assertEqual(brand["country"], "Pakistan")
        self.assertEqual(brand["phone"], "0321-7557444")
        self.assertEqual(brand["logoUrl"], "https://example.com/logo.png")
        self.assertEqual(brand["color"], "#55a216")

    def test_brand_api_fields_write_to_profile_columns(self):
        payload = BrandService._db_payload(
            BrandService.normalize_payload(
                {
                    "name": "Paragon Health Foods",
                    "codePrefix": "786",
                    "shortName": "PHF",
                    "contactName": "Purchase Manager",
                    "contactEmail": "purchase@example.com",
                    "addressLine1": "Street 1",
                    "addressLine2": "Suite 2",
                    "city": "Lahore",
                    "province": "Punjab",
                    "country": "Pakistan",
                    "phone": "0321-7557444",
                    "logoUrl": "https://example.com/logo.png",
                    "color": "#55a216",
                }
            )
        )

        self.assertEqual(payload["short_name"], "PHF")
        self.assertEqual(payload["contact_name"], "Purchase Manager")
        self.assertEqual(payload["contact_email"], "purchase@example.com")
        self.assertEqual(payload["address_line_1"], "Street 1")
        self.assertEqual(payload["address_line_2"], "Suite 2")
        self.assertEqual(payload["city"], "Lahore")
        self.assertEqual(payload["province"], "Punjab")
        self.assertEqual(payload["country"], "Pakistan")
        self.assertEqual(payload["contact_phone"], "0321-7557444")
        self.assertEqual(payload["logo_url"], "https://example.com/logo.png")
        self.assertEqual(payload["brand_color"], "#55a216")

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
