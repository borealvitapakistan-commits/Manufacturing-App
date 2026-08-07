from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from apps.manufacturing.serializers.assembly import AssemblySerializer
from apps.manufacturing.services.assembly.rules import AssemblyRules
from apps.manufacturing.services.assembly.service import AssemblyService
from services.base_service import ServiceError


class AssemblyAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.manufacturing.views.assembly.AssemblyService.list")
    def test_assembly_list_uses_manufacturing_service_filters(self, mocked_list):
        mocked_list.return_value = [{"id": "assembly-1", "assemblyCode": "A-786-001"}]

        response = self.client.get(
            "/api/manufacturing/assembly/",
            {"brandId": "brand-1", "productId": "product-1", "encapsulationId": "encap-1", "search": "ash"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["assemblyCode"], "A-786-001")
        mocked_list.assert_called_once()
        kwargs = mocked_list.call_args.kwargs
        self.assertEqual(kwargs["brand_id"], "brand-1")
        self.assertEqual(kwargs["product_id"], "product-1")
        self.assertEqual(kwargs["njp_id"], "encap-1")
        self.assertEqual(kwargs["search"], "ash")

    @patch("apps.manufacturing.views.assembly.AssemblyService.create")
    def test_assembly_create_returns_record(self, mocked_create):
        mocked_create.return_value = {"id": "assembly-1", "assemblyCode": "A-786-001", "batchCode": "MIX-0001"}

        response = self.client.post(
            "/api/manufacturing/assembly/",
            {
                "encapsulationId": "encap-1",
                "brandId": "brand-1",
                "productId": "product-1",
                "capsulesPerBottle": 120,
                "bottleQuantity": 10,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["assemblyCode"], "A-786-001")
        mocked_create.assert_called_once()

    @patch("apps.manufacturing.views.assembly.AssemblyService.update")
    def test_assembly_update_calls_service(self, mocked_update):
        mocked_update.return_value = {"id": "assembly-1", "assemblyCode": "A-786-001"}

        response = self.client.put(
            "/api/manufacturing/assembly/assembly-1/",
            {"encapsulationId": "encap-1", "capsulesPerBottle": 120, "bottleQuantity": 12},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once()
        self.assertEqual(mocked_update.call_args.args[0], "assembly-1")

    @patch("apps.manufacturing.views.assembly.AssemblyService.delete")
    def test_assembly_delete_calls_service(self, mocked_delete):
        mocked_delete.return_value = {"success": True}

        response = self.client.delete("/api/manufacturing/assembly/assembly-1/")

        self.assertEqual(response.status_code, 200)
        mocked_delete.assert_called_once_with("assembly-1")


class _FakeAssemblyRules(AssemblyRules):
    """Test double supplying canned Encapsulation/bottle-lid/label data so
    AssemblyRules._clean_payload's validation/derivation logic can be
    exercised without touching Supabase."""

    encapsulation = {
        "id": "encap-1",
        "brandId": "brand-1",
        "brandName": "Test Brand",
        "productId": "product-1",
        "productName": "Test Product",
        "mixingCode": "MIX-0001",
        "lotNumber": "MIX-0001",
        "encapsulationCode": "E-TES-001",
        "location": "R1",
    }
    bottle_lid = {
        "id": "bottle-1",
        "bottleType": "capsule",
        "bottle_type": "capsule",
        "capsuleType": "300",
        "capsule_type": "300",
    }
    label = {"id": "label-1", "dosageType": "120"}
    brand_prefix = "786"

    @classmethod
    def _find_njp(cls, njp_id):
        return dict(cls.encapsulation)

    @classmethod
    def _resolve_bottle_lid(cls, payload, existing, total_bottles_made):
        return dict(cls.bottle_lid) if cls.bottle_lid else None

    @classmethod
    def _resolve_label(cls, payload, existing, total_labels_used, *, brand_id, product_id):
        return dict(cls.label) if cls.label else None

    @classmethod
    def _brand_lookup(cls, brand_ref):
        if not cls.brand_prefix:
            return {}
        return {"id": "brand-1", "name": "Test Brand", "codePrefix": cls.brand_prefix, "code_prefix": cls.brand_prefix}


def _base_payload(**overrides):
    payload = {
        "encapsulationId": "encap-1",
        "capsulesPerBottle": 120,
        "bottleQuantity": 10,
        "bottleCC": "300",
        "bottleCapsuleType": "300",
        "capsuleWeightMg": "500",
    }
    payload.update(overrides)
    return payload


class AssemblyRulesTests(SimpleTestCase):
    def test_correct_total_units_calculation(self):
        cleaned = _FakeAssemblyRules._clean_payload(_base_payload(capsulesPerBottle=120, bottleQuantity=10))
        self.assertEqual(cleaned["totalUnitsUsed"], 1200)
        self.assertEqual(cleaned["capsulesReceivedQty"], 1200)
        self.assertEqual(cleaned["bottleQuantity"], 10)
        self.assertEqual(cleaned["capsulesPerBottle"], 120)

    def test_capsules_per_bottle_exceeding_label_dosage_count_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            _FakeAssemblyRules._clean_payload(_base_payload(capsulesPerBottle=150))
        self.assertIn("cannot exceed the selected label dosage count of 120", str(ctx.exception))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_invalid_bottle_quantity_zero_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            _FakeAssemblyRules._clean_payload(_base_payload(bottleQuantity=0))
        self.assertIn("Bottle Quantity", str(ctx.exception))

    def test_invalid_bottle_quantity_negative_rejected(self):
        with self.assertRaises(ServiceError):
            _FakeAssemblyRules._clean_payload(_base_payload(bottleQuantity=-5))

    def test_invalid_capsules_per_bottle_zero_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            _FakeAssemblyRules._clean_payload(_base_payload(capsulesPerBottle=0))
        self.assertIn("Capsules per Bottle", str(ctx.exception))

    def test_invalid_weight_unit_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            _FakeAssemblyRules._clean_payload(_base_payload(weightUnit="lb", filledBottleWeight="10"))
        self.assertIn("Weight unit must be g or mg", str(ctx.exception))

    def test_invalid_filled_bottle_weight_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            _FakeAssemblyRules._clean_payload(_base_payload(filledBottleWeight="0"))
        self.assertIn("Filled Bottle Weight must be greater than zero", str(ctx.exception))

    def test_missing_brand_code_validation(self):
        original_prefix = _FakeAssemblyRules.brand_prefix
        _FakeAssemblyRules.brand_prefix = ""
        try:
            with self.assertRaises(ServiceError) as ctx:
                _FakeAssemblyRules._clean_payload(_base_payload())
            self.assertIn("Brand code prefix is required", str(ctx.exception))
        finally:
            _FakeAssemblyRules.brand_prefix = original_prefix

    def test_invalid_product_batch_relationship_rejected(self):
        with self.assertRaises(ServiceError) as ctx:
            _FakeAssemblyRules._clean_payload(_base_payload(productId="some-other-product"))
        self.assertIn("does not belong to the selected product", str(ctx.exception))

    def test_batch_code_derived_from_encapsulation_lot_number(self):
        cleaned = _FakeAssemblyRules._clean_payload(_base_payload())
        self.assertEqual(cleaned["batchCode"], "MIX-0001")

    def test_assembly_code_unchanged_during_editing(self):
        existing = {
            "id": "assembly-1",
            "assemblyCode": "A-786-001",
            "brandBatchCodes": [{"brandId": "brand-1", "batchCode": "A-786-001"}],
        }
        cleaned = _FakeAssemblyRules._clean_payload(_base_payload(), existing=existing)
        self.assertEqual(cleaned["assemblyCode"], "A-786-001")


class AssemblyServiceLabelValidationTests(SimpleTestCase):
    """Exercises AssemblyService's real label/bottle-lid resolution (not the
    fake stubs above) to verify product-mismatch rejection."""

    @patch.object(AssemblyService, "_brand_lookup")
    @patch("apps.manufacturing.services.assembly.service.LabelService.find_label_item")
    @patch("apps.manufacturing.services.assembly.service.BottleLidService.find_packaging_item")
    @patch.object(AssemblyService, "_find_njp")
    def test_invalid_product_label_relationship_rejected(
        self, mocked_find_njp, mocked_find_packaging_item, mocked_find_label_item, mocked_brand_lookup
    ):
        mocked_brand_lookup.return_value = {
            "id": "brand-1",
            "name": "Test Brand",
            "codePrefix": "786",
            "code_prefix": "786",
        }
        mocked_find_njp.return_value = {
            "id": "encap-1",
            "brandId": "brand-1",
            "brandName": "Test Brand",
            "productId": "product-1",
            "productName": "Test Product",
            "mixingCode": "MIX-0001",
            "lotNumber": "MIX-0001",
        }
        mocked_find_packaging_item.return_value = {
            "id": "bottle-1",
            "bottleType": "capsule",
            "bottle_type": "capsule",
            "capsuleType": "300",
            "capsule_type": "300",
        }
        # No label matches this brand/product combination.
        mocked_find_label_item.return_value = None

        with self.assertRaises(ServiceError) as ctx:
            AssemblyService._clean_payload(_base_payload())
        self.assertIn("Labels for this brand/product are not available", str(ctx.exception))


class AssemblySerializerTests(SimpleTestCase):
    def test_decimal_bottle_quantity_rejected(self):
        serializer = AssemblySerializer(data=_base_payload(bottleQuantity="2.5"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("bottleQuantity", serializer.errors)

    def test_decimal_capsules_per_bottle_rejected(self):
        serializer = AssemblySerializer(data=_base_payload(capsulesPerBottle="12.5"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("capsulesPerBottle", serializer.errors)

    def test_invalid_weight_unit_choice_rejected(self):
        serializer = AssemblySerializer(data=_base_payload(weightUnit="lb"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("weightUnit", serializer.errors)

    def test_valid_payload_accepted(self):
        serializer = AssemblySerializer(data=_base_payload())
        self.assertTrue(serializer.is_valid(), serializer.errors)
