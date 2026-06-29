from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from services.base_service import ServiceError, TableService
from services.catalog_service import ProductService


class ProductServiceTests(SimpleTestCase):
    def test_label_claim_parser_matches_old_backend_units(self):
        self.assertEqual(ProductService.parse_label_claim("500 mg per capsule"), 500)
        self.assertEqual(ProductService.parse_label_claim("2 g"), 2000)
        self.assertEqual(ProductService.parse_label_claim("10 mcg"), 0.01)
        self.assertEqual(ProductService.parse_label_claim("10 µg"), 0.01)

    def test_raw_material_name_is_linked_to_existing_record(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(data=[{"id": "11111111-1111-1111-1111-111111111111", "code": "RM001"}])
        )

        with patch.object(ProductService, "client", return_value=client):
            result = ProductService.process_raw_materials(
                [{"rawMaterial": "Ashwagandha", "labelClaim": "2 g"}]
            )

        self.assertEqual(result[0]["rawMaterialId"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(result[0]["rawMaterialCode"], "RM001")
        self.assertEqual(result[0]["labelClaimMgPerUnit"], 2000)

    def test_blank_npn_is_stored_as_null(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(
                data=[
                    {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "code": "RM001",
                        "name": "Ashwagandha",
                    }
                ]
            )
        )
        with (
            patch.object(ProductService, "client", return_value=client),
            patch.object(TableService, "create", return_value={"id": "product-id"}) as mocked_create,
        ):
            ProductService.create(
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

        payload = mocked_create.call_args.args[0]
        self.assertIsNone(payload["npn"])
        self.assertEqual(payload["rm"][0]["labelClaimMgPerUnit"], 500)

    def test_formula_material_id_is_verified_and_canonicalized(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(
                data=[
                    {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "code": "RM-ZIN",
                        "name": "Zinc",
                    }
                ]
            )
        )

        with patch.object(ProductService, "client", return_value=client):
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

    def test_product_with_batches_cannot_be_deleted(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            SimpleNamespace(data=[{"id": "batch-id"}])
        )

        with patch.object(ProductService, "client", return_value=client):
            with self.assertRaises(ServiceError) as raised:
                ProductService.delete("11111111-1111-1111-1111-111111111111")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(str(raised.exception), "Cannot delete product with existing batches")

    @patch.object(ProductService, "list")
    def test_products_can_be_looked_up_by_formula_material(self, mocked_list):
        mocked_list.return_value = [
            {"id": "p1", "rm": [{"rawMaterialId": "rm1"}]},
            {"id": "p2", "rm": [{"rawMaterialId": "rm2"}]},
        ]

        result = ProductService.get_by_raw_material("rm2")

        self.assertEqual([item["id"] for item in result], ["p2"])
