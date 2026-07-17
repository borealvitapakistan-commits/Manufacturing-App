from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.commercial.serializers.products import ProductSerializer
from apps.commercial.services.products import ProductService
from services import db
from services.base_service import ServiceError


class ProductServiceTests(SimpleTestCase):
    def test_label_claim_parser_matches_old_backend_units(self):
        self.assertEqual(ProductService.parse_label_claim("500 mg per capsule"), 500)
        self.assertEqual(ProductService.parse_label_claim("2 g"), 2000)
        self.assertEqual(ProductService.parse_label_claim("10 mcg"), 0.01)
        self.assertEqual(ProductService.parse_label_claim("10 Âµg"), 0.01)

    @patch("apps.commercial.services.products.db.execute")
    @patch(
        "apps.commercial.services.products.db.one",
        return_value={
            "id": "11111111-1111-1111-1111-111111111111",
            "item_code": "RM001",
            "item_name": "Ashwagandha",
        },
    )
    def test_raw_material_id_is_linked_to_existing_record(self, mocked_one, mocked_execute):
        result = ProductService.process_raw_materials(
            [
                {
                    "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                    "rawMaterial": "stale name",
                    "labelClaim": "2 g",
                }
            ]
        )

        self.assertEqual(result[0]["rawMaterialId"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(result[0]["rawMaterialCode"], "RM001")
        self.assertEqual(result[0]["rawMaterial"], "Ashwagandha")
        self.assertEqual(result[0]["labelClaimMgPerUnit"], 2000)

    @patch.object(ProductService, "process_raw_materials_db")
    def test_blank_npn_is_stored_as_null(self, mocked_process):
        mocked_process.return_value = [
            {
                "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                "rawMaterial": "Ashwagandha",
                "rawMaterialCode": "RM001",
                "labelClaim": "500 mg",
                "labelClaimMgPerUnit": 500,
            }
        ]
        normalized = ProductService.normalize_payload(
            {
                "name": "Test Product",
                "npn": "   ",
                "rm": [
                    {
                        "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                        "rawMaterial": "Ashwagandha",
                        "labelClaim": "500 mg",
                    }
                ],
            }
        )

        self.assertIsNone(normalized["npn"])
        self.assertEqual(normalized["type"], "capsule")
        self.assertEqual(normalized["rm"][0]["labelClaimMgPerUnit"], 500)

    @patch.object(ProductService, "_db_create", return_value={"id": "product-id"})
    def test_product_type_is_accepted_on_create(self, mocked_create):
        ProductService.create({"name": "Softgel Product", "type": "Softgel", "rm": []})

        self.assertEqual(mocked_create.call_args.args[0]["type"], "softgel")

    def test_serializer_normalizes_display_product_type(self):
        serializer = ProductSerializer(
            data={
                "name": "Capsule Product",
                "type": "Capsule",
                "rm": [
                    {
                        "sr": 1,
                        "rawMaterial": "Zinc",
                        "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                        "labelClaim": "15 mg",
                        "labelClaimMgPerUnit": "15",
                    }
                ],
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["type"], "capsule")

    def test_formula_metadata_is_json_safe_after_serializer_validation(self):
        serializer = ProductSerializer(
            data={
                "name": "Capsule Product",
                "type": "Capsule",
                "rm": [
                    {
                        "sr": 1,
                        "rawMaterial": "Zinc",
                        "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                        "labelClaim": "15 mg",
                        "labelClaimMgPerUnit": "15",
                    }
                ],
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        metadata = db.json_safe(serializer.validated_data["rm"][0])

        self.assertEqual(metadata["rawMaterialId"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(metadata["labelClaimMgPerUnit"], "15.000000")

    @patch("apps.commercial.services.products.db.execute")
    @patch("apps.commercial.services.products.db.client")
    def test_formula_replace_writes_json_safe_metadata(self, mocked_client, mocked_execute):
        serializer = ProductSerializer(
            data={
                "name": "Capsule Product",
                "type": "Capsule",
                "rm": [
                    {
                        "sr": 1,
                        "rawMaterial": "Zinc",
                        "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                        "labelClaim": "15 mg",
                        "labelClaimMgPerUnit": "15",
                    }
                ],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        table = mocked_client.return_value.table.return_value

        ProductService._db_replace_formula(
            "22222222-2222-2222-2222-222222222222",
            serializer.validated_data["rm"],
        )

        rows = table.insert.call_args.args[0]
        metadata = rows[0]["metadata"]
        self.assertEqual(metadata["rawMaterialId"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(metadata["labelClaimMgPerUnit"], "15.000000")

    def test_invalid_product_type_is_rejected(self):
        with self.assertRaisesMessage(ServiceError, "Invalid product type"):
            ProductService.create({"name": "Bad Product", "type": "cream", "rm": []})

    @patch.object(ProductService, "_db_existing_product")
    def test_duplicate_npn_has_friendly_error(self, mocked_existing_product):
        mocked_existing_product.return_value = {
            "id": "22222222-2222-2222-2222-222222222222",
            "product_name": "Berberine",
            "npn": "12345678",
        }

        with self.assertRaisesMessage(
            ServiceError,
            "A product with this NPN already exists: 12345678.",
        ):
            ProductService._db_validate_unique_fields({"npn": "12345678"})

    @patch("apps.commercial.services.products.db.execute")
    @patch(
        "apps.commercial.services.products.db.one",
        return_value={
            "id": "11111111-1111-1111-1111-111111111111",
            "item_code": "RM-ZIN",
            "item_name": "Zinc",
        },
    )
    def test_formula_material_id_is_verified_and_canonicalized(self, mocked_one, mocked_execute):
        result = ProductService.process_raw_materials(
            [
                {
                    "rawMaterialId": "11111111-1111-1111-1111-111111111111",
                    "rawMaterial": "stale name",
                    "rawMaterialCode": "stale code",
                    "labelClaim": "15 mg",
                }
            ]
        )

        self.assertEqual(result[0]["rawMaterial"], "Zinc")
        self.assertEqual(result[0]["rawMaterialCode"], "RM-ZIN")

    @patch("apps.commercial.services.products.db.client")
    @patch("apps.commercial.services.products.db.execute")
    @patch("apps.commercial.services.products.db.one", return_value={"id": "mix-1"})
    def test_product_with_manufacturing_records_cannot_be_deleted(
        self,
        mocked_one,
        mocked_execute,
        mocked_client,
    ): 
        with self.assertRaises(ServiceError) as raised:
            ProductService.delete("11111111-1111-1111-1111-111111111111")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            str(raised.exception),
            "Cannot delete product with existing manufacturing records",
        )

    @patch("apps.commercial.services.products.db.client")
    @patch("apps.commercial.services.products.db.execute")
    @patch(
        "apps.commercial.services.products.db.data",
        return_value=[{"product_id": "p2"}],
    )
    @patch.object(ProductService, "list")
    def test_products_can_be_looked_up_by_formula_material(
        self,
        mocked_list,
        mocked_data,
        mocked_execute,
        mocked_client,
    ):
        mocked_list.return_value = [
            {"id": "p1", "rm": [{"rawMaterialId": "rm1"}]},
            {"id": "p2", "rm": [{"rawMaterialId": "rm2"}]},
        ]

        result = ProductService.get_by_raw_material("rm2")

        self.assertEqual([item["id"] for item in result], ["p2"])
