from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient


class EncapsulationAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.manufacturing.views.encapsulation.EncapsulationService.create")
    def test_encapsulation_create_uses_serializer_and_service(self, mocked_create):
        mocked_create.return_value = {
            "id": "encapsulation-1",
            "encapsulationCode": "E-ASH-001",
            "njpCode": "E-ASH-001",
        }

        response = self.client.post(
            "/api/manufacturing/encapsulation/",
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
        self.assertEqual(response.json()["data"]["encapsulationCode"], "E-ASH-001")
        mocked_create.assert_called_once()
