from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class NJPAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.manufacturing.views.njp.NJPService.create")
    def test_njp_create_uses_njp_serializer_and_service(self, mocked_create):
        mocked_create.return_value = {"id": "njp-1", "njpCode": "NJP-0001"}

        response = self.client.post(
            "/api/njp/",
            {
                "mixingId": "mix-1",
                "mixingCode": "MIX-0001",
                "productName": "Ashwagandha",
                "capsuleSize": "00",
                "status": "Underprocess",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["njpCode"], "NJP-0001")
        mocked_create.assert_called_once()
