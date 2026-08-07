from django.test import SimpleTestCase

from apps.inventory.serializers.raw_materials import RawMaterialCategorySerializer
from apps.inventory.services.raw_materials import RawMaterialCategoryService


class RawMaterialCategorySerializerTests(SimpleTestCase):
    def test_accepts_nmi_flag_and_metadata(self):
        serializer = RawMaterialCategorySerializer(
            data={
                "name": "NMI",
                "description": "Non-medicinal ingredients",
                "isActive": True,
                "isNmiCategory": True,
                "metadata": {"use": "mixing"},
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertTrue(serializer.validated_data["isNmiCategory"])
        self.assertEqual(serializer.validated_data["metadata"], {"use": "mixing"})


class RawMaterialCategoryPayloadTests(SimpleTestCase):
    def test_normalizes_without_code_column(self):
        payload = RawMaterialCategoryService.normalize_payload(
            {
                "name": " NMI ",
                "description": " Non-medicinal ingredients ",
                "isActive": "false",
                "isNmiCategory": "true",
                "metadata": {"use": "mixing"},
            }
        )

        self.assertNotIn("code", payload)
        self.assertEqual(payload["name"], "NMI")
        self.assertEqual(payload["description"], "Non-medicinal ingredients")
        self.assertFalse(payload["isActive"])
        self.assertTrue(payload["isNmiCategory"])
        self.assertEqual(payload["metadata"], {"use": "mixing"})

    def test_rejects_non_object_metadata(self):
        with self.assertRaisesMessage(Exception, "Category metadata must be a JSON object"):
            RawMaterialCategoryService.normalize_payload({"name": "NMI", "metadata": ["bad"]})
