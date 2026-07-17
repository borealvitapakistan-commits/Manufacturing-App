from django.test import SimpleTestCase

from apps.inventory.serializers.labels import LabelSerializer
from services import db


class LabelSerializerTests(SimpleTestCase):
    def test_serializer_normalizes_display_label_type(self):
        serializer = LabelSerializer(
            data={
                "brandId": "11111111-1111-1111-1111-111111111111",
                "productId": "22222222-2222-2222-2222-222222222222",
                "type": "Capsule",
                "dosageType": "60",
                "labelName": "Standard Label",
                "quantity": 6000,
                "reorderLevel": 0,
                "isActive": True,
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["type"], "capsule")

    def test_serializer_payload_is_json_safe_after_uuid_validation(self):
        serializer = LabelSerializer(
            data={
                "brandId": "11111111-1111-1111-1111-111111111111",
                "productId": "22222222-2222-2222-2222-222222222222",
                "type": "Capsule",
                "dosageType": "60",
                "labelName": "Standard Label",
                "quantity": 6000,
                "reorderLevel": 0,
                "isActive": True,
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        metadata = db.json_safe(serializer.validated_data)

        self.assertEqual(metadata["brandId"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(metadata["productId"], "22222222-2222-2222-2222-222222222222")

