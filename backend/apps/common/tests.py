from decimal import Decimal
from uuid import UUID

from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.urls import resolve
from rest_framework.test import APIClient

from services.converters import payload_to_db, row_to_app


class CommonAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.common.views.get_supabase")
    def test_health_checks_live_supabase_connection(self, mocked_get_supabase):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertTrue(response.json()["supabaseConnected"])
        self.assertEqual(response.json()["database"], "supabase")

    @override_settings(SUPABASE_URL="", SUPABASE_SERVICE_ROLE_KEY="", SUPABASE_ANON_KEY="")
    def test_health_returns_503_without_supabase(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ok"])
        self.assertFalse(response.json()["supabaseConnected"])

    @override_settings(SUPABASE_URL="", SUPABASE_SERVICE_ROLE_KEY="", SUPABASE_ANON_KEY="")
    def test_unconfigured_data_endpoint_returns_503(self):
        response = self.client.get("/api/brands")
        self.assertEqual(response.status_code, 503)
        self.assertIn("Supabase is not configured", response.json()["error"])

    def test_slashless_alias_resolves(self):
        self.assertEqual(resolve("/api/batches").url_name, None)
        self.assertEqual(resolve("/api/purchase-orders").url_name, None)


class ConverterTests(SimpleTestCase):
    def test_payload_converts_uuid_decimal_and_nested_values(self):
        value = UUID("11111111-1111-1111-1111-111111111111")
        result = payload_to_db(
            {
                "brandId": value,
                "quantity": Decimal("1.2500"),
                "items": [{"amount": Decimal("2.50"), "id": value}],
            }
        )
        self.assertEqual(result["brand_id"], str(value))
        self.assertEqual(result["quantity"], 1.25)
        self.assertEqual(result["items"][0]["amount"], 2.5)

    def test_row_converts_closed_timestamp_and_njp_name(self):
        row = row_to_app(
            {
                "has_njp": True,
                "closed_at": "2026-06-24T00:00:00+00:00",
            }
        )
        self.assertTrue(row["hasNJP"])
        self.assertIsInstance(row["closedAt"], int)
