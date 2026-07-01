from unittest.mock import patch
from uuid import UUID

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.base_service import ServiceError
from services.batch_service import (
    AssemblyService,
    BatchService,
    MixingService,
    NJPService,
    StageLifecycleService,
)
from services.local_mixing_service import LocalMixingService


class BatchServiceUnitTests(SimpleTestCase):
    def test_formula_parser_supports_mg_g_and_mcg(self):
        self.assertEqual(BatchService._formula_mg({"labelClaim": "500mg"}), 500)
        self.assertEqual(BatchService._formula_mg({"labelClaim": "2 g"}), 2000)
        self.assertEqual(BatchService._formula_mg({"labelClaim": "10mcg"}), 0.01)
        self.assertEqual(BatchService._formula_mg({"labelClaim": "10µg"}), 0.01)

    @patch("services.batch_service.BatchService.get")
    def test_njp_requires_mixing_and_uses_original_yield_formula(self, mocked_get):
        mocked_get.return_value = {
            "id": "batch-id",
            "hasMixing": True,
            "brandId": "brand-id",
            "productId": "product-id",
            "batchCode": "BV001",
            "brandName": "Boriel Vita",
            "productName": "Product",
        }

        payload = NJPService._build_payload(
            "batch-id",
            {
                "totalCapsulesFilledQty": 900,
                "rejectedCapsulesQty": 100,
                "temperatureC": 25,
            },
        )

        self.assertEqual(payload["yieldPercent"], 88.8889)
        self.assertEqual(payload["temperatureF"], 77)

        mocked_get.return_value["hasMixing"] = False
        with self.assertRaisesMessage(
            ServiceError,
            "Mixing must be completed before NJP",
        ):
            NJPService._build_payload("batch-id", {})

    @patch("services.batch_service.BatchService.get")
    def test_assembly_requires_mixing_and_njp(self, mocked_get):
        mocked_get.return_value = {
            "hasMixing": True,
            "hasNJP": False,
        }

        with self.assertRaisesMessage(
            ServiceError,
            "Cannot create Assembly until Mixing and NJP are complete",
        ):
            AssemblyService._build_payload("batch-id", {})

    def test_mixing_scaling_formula_is_checked_server_side(self):
        valid = {
            "totalFormulaQtyKg": 10,
            "existingMixedPowderUsedKg": 2,
            "totalMixedQtyKg": 8,
            "rmUsage": [
                {
                    "rawMaterialName": "Zinc",
                    "requiredQtyKgFormula": 5,
                    "requiredQtyKgThisMix": 4,
                    "qtyBeforeKg": 10,
                    "qtyAfterKg": 6,
                }
            ],
            "nonMedUsage": [
                {
                    "name": "Silica",
                    "requiredQtyKgFormula": 5,
                    "requiredQtyKgThisMix": 4,
                    "qtyBeforeKg": 4,
                    "qtyAfterKg": 0,
                }
            ],
        }
        MixingService._validate_plan(valid)

        invalid = {**valid, "totalMixedQtyKg": 9}
        with self.assertRaisesMessage(
            ServiceError,
            "Total mixed quantity must equal",
        ):
            MixingService._validate_plan(invalid)

    def test_njp_load_check_average_is_recomputed(self):
        rows = NJPService._normalize_load_checks(
            [
                {
                    "time": "10:00",
                    "w1Mg": 500,
                    "w2Mg": 510,
                    "w3Mg": "",
                    "avgWeightMg": 999,
                },
                {},
            ]
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["avgWeightMg"], 505)

    @patch("services.batch_service.BatchService.update")
    @patch("services.batch_service.BatchService.get")
    def test_start_mixing_saves_in_progress_report_without_completion_flag(
        self,
        mocked_get,
        mocked_update,
    ):
        def fake_create(service_class, payload):
            return {"id": "report-id", **payload}

        mocked_get.side_effect = [
            {
                "id": "batch-id",
                "hasMixing": False,
                "status": "mixingPending",
                "brandId": "brand-id",
                "productId": "product-id",
                "batchCode": "BV001",
                "brandName": "Boriel Vita",
                "productName": "Product",
            },
            {"id": "batch-id", "batchStatus": "In Mixing"},
        ]

        with patch("services.batch_service.TableService.create", new=classmethod(fake_create)), patch(
            "services.batch_service.MixingService.get_by_batch",
            side_effect=ServiceError("Mixing report not found", 404),
        ):
            result = StageLifecycleService.start_stage(
                "batch-id",
                "mixing",
                {"startDate": 1782518400000, "startTime": "09:15", "remarks": "Started"},
            )

        report_payload = result["report"]
        self.assertEqual(report_payload["status"], "In Mixing")
        self.assertEqual(report_payload["startTime"], "09:15")
        self.assertFalse(report_payload.get("hasMixing", False))
        mocked_update.assert_called_once()
        update_payload = mocked_update.call_args.args[1]
        self.assertEqual(update_payload["batchStatus"], "In Mixing")
        self.assertEqual(update_payload["currentStage"], "mixing")
        self.assertEqual(result["report"]["status"], "In Mixing")

    @patch("services.batch_service.BatchService.get")
    @patch("services.batch_service.BatchService.update")
    def test_stage_lifecycle_update_saves_completed_metadata_without_completion_flow(
        self,
        mocked_update,
        mocked_get,
    ):
        def fake_create(service_class, payload):
            return {"id": "report-id", **payload}

        mocked_get.side_effect = [
            {
                "id": "batch-id",
                "hasMixing": False,
                "status": "mixingPending",
                "brandId": "brand-id",
                "productId": "product-id",
                "batchCode": "BV001",
                "brandName": "Boriel Vita",
                "productName": "Product",
            },
            {"id": "batch-id", "batchStatus": "Mixing Completed"},
        ]

        with patch("services.batch_service.TableService.create", new=classmethod(fake_create)), patch(
            "services.batch_service.MixingService.get_by_batch",
            side_effect=ServiceError("Mixing report not found", 404),
        ):
            result = StageLifecycleService.update_stage(
                "batch-id",
                "mixing",
                {
                    "startDate": 1782518400000,
                    "startTime": "09:15",
                    "endDate": 1782604800000,
                    "endTime": "18:10",
                    "remarks": "Finished",
                },
            )

        self.assertEqual(result["report"]["status"], "Mixing Completed")
        update_payload = mocked_update.call_args_list[0].args[1]
        self.assertTrue(update_payload["hasMixing"])
        self.assertEqual(update_payload["status"], "ngpPending")
        self.assertEqual(update_payload["currentStage"], "njp")

    @patch("services.batch_service.BatchService.get")
    @patch("services.batch_service.BatchService.update")
    def test_stage_lifecycle_update_preserves_later_stage_progress(
        self,
        mocked_update,
        mocked_get,
    ):
        def fake_update(service_class, item_id, payload):
            return {"id": item_id, **payload}

        mocked_get.side_effect = [
            {
                "id": "batch-id",
                "hasMixing": True,
                "hasNJP": True,
                "hasAssembly": False,
                "status": "assemblyPending",
                "batchStatus": "NJP Completed",
                "currentStage": "assembly",
                "brandId": "brand-id",
                "productId": "product-id",
                "batchCode": "BV001",
                "brandName": "Boriel Vita",
                "productName": "Product",
            },
            {"id": "batch-id", "batchStatus": "NJP Completed"},
        ]

        with patch("services.batch_service.TableService.update", new=classmethod(fake_update)), patch(
            "services.batch_service.MixingService.get_by_batch",
            return_value={
                "id": "mixing-report-id",
                "batchId": "batch-id",
                "status": "Mixing Completed",
            },
        ):
            StageLifecycleService.update_stage(
                "batch-id",
                "mixing",
                {
                    "startDate": 1782518400000,
                    "startTime": "09:15",
                    "endDate": 1782604800000,
                    "endTime": "18:10",
                },
            )

        update_payload = mocked_update.call_args_list[0].args[1]
        self.assertTrue(update_payload["hasMixing"])
        self.assertTrue(update_payload["hasNJP"])
        self.assertEqual(update_payload["batchStatus"], "NJP Completed")
        self.assertEqual(update_payload["status"], "assemblyPending")
        self.assertEqual(update_payload["currentStage"], "assembly")

    def test_local_mixing_creates_standalone_record_with_own_code_and_total(self):
        class MemoryStore:
            def __init__(self):
                self.value = []

            def read(self):
                return self.value

            def write(self, value):
                self.value = value

        original_store = LocalMixingService.store
        LocalMixingService.store = MemoryStore()
        try:
            record = LocalMixingService.create(
                {
                    "brandId": "brand-id",
                    "brandName": "Paragon Health Foods",
                    "productId": "product-id",
                    "productName": "Amla",
                    "startDate": 1782518400000,
                    "startTime": "09:00",
                    "mixedPowderName": "Existing Amla Powder",
                    "existingMixedPowderUsedKg": 2,
                    "byBookRawMaterials": [
                        {"rawMaterialName": "Raw material 1", "usedQtyKg": 3}
                    ],
                    "pragmaticRawMaterials": [
                        {"rawMaterialName": "Raw material 4", "usedQtyKg": 1.5}
                    ],
                    "nonMedUsage": [
                        {"rawMaterialName": "Silica", "usedQtyKg": 0.25}
                    ],
                }
            )

            self.assertTrue(record["mixingCode"].startswith("MIX-"))
            self.assertNotIn("batchId", record)
            self.assertNotIn("productNumber", record)
            self.assertEqual(record["brandId"], "brand-id")
            self.assertEqual(record["productId"], "product-id")
            self.assertEqual(record["productName"], "Amla")
            self.assertEqual(record["totalFormulaQtyKg"], 6.75)

            updated = LocalMixingService.update(
                record["id"],
                {"productName": "Amla Updated"},
            )
            self.assertEqual(updated["productName"], "Amla Updated")
            self.assertEqual(len(updated["byBookRawMaterials"]), 1)
            self.assertEqual(updated["totalFormulaQtyKg"], 6.75)

            with self.assertRaisesMessage(ServiceError, "Mixing code already exists"):
                LocalMixingService.create(
                    {
                        "brandId": "brand-id",
                        "brandName": "Paragon Health Foods",
                        "productId": "product-id",
                        "productName": "Amla",
                        "mixingCode": record["mixingCode"],
                        "byBookRawMaterials": [
                            {"rawMaterialName": "Raw material 1", "usedQtyKg": 1}
                        ],
                    }
                )
        finally:
            LocalMixingService.store = original_store


class BatchAPITests(SimpleTestCase):
    batch_id = "11111111-1111-1111-1111-111111111111"

    def setUp(self):
        self.client = APIClient()

    @patch("apps.batches.views.BatchService.delete_safely")
    def test_delete_passes_cascade_flag(self, mocked_delete):
        mocked_delete.return_value = {"success": True}
        response = self.client.delete(f"/api/batches/{self.batch_id}?cascade=true")
        self.assertEqual(response.status_code, 200)
        mocked_delete.assert_called_once_with(self.batch_id, cascade=True)

    @patch("apps.batches.views.NJPService.create_for_batch")
    def test_njp_endpoint_calculates_with_validated_payload(self, mocked_create):
        mocked_create.return_value = {"id": self.batch_id}
        response = self.client.post(
            f"/api/batches/{self.batch_id}/njp",
            {
                "totalCapsulesFilledQty": 900,
                "rejectedCapsulesQty": 100,
                "temperatureC": "25.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        mocked_create.assert_called_once()

    def test_batch_creation_requires_core_fields(self):
        response = self.client.post("/api/batches", {"notes": "missing data"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Validation failed")

    def test_standalone_mixing_slashless_api_uses_local_store(self):
        class MemoryStore:
            def __init__(self):
                self.value = []

            def read(self):
                return self.value

            def write(self, value):
                self.value = value

        original_store = LocalMixingService.store
        LocalMixingService.store = MemoryStore()
        try:
            response = self.client.post(
                "/api/mixing",
                {
                    "brandId": self.batch_id,
                    "brandName": "Boreal Vita",
                    "productId": self.batch_id,
                    "productName": "Ashwagandha with pepper",
                    "byBookRawMaterials": [
                        {"rawMaterialName": "Ashwagandha 4:1", "usedQtyKg": "2.5"}
                    ],
                },
                format="json",
            )
            self.assertEqual(response.status_code, 201)
            record = response.json()["data"]
            self.assertEqual(record["mixingCode"], "MIX-0001")
            self.assertEqual(record["totalFormulaQtyKg"], 2.5)

            list_response = self.client.get("/api/mixing")
            self.assertEqual(list_response.status_code, 200)
            self.assertEqual(len(list_response.json()["data"]), 1)

            patch_response = self.client.patch(
                f"/api/mixing/{record['id']}",
                {"mixingCode": "MIX-MANUAL"},
                format="json",
            )
            self.assertEqual(patch_response.status_code, 200)
            self.assertEqual(patch_response.json()["data"]["mixingCode"], "MIX-MANUAL")

            delete_response = self.client.delete(f"/api/mixing/{record['id']}")
            self.assertEqual(delete_response.status_code, 200)
        finally:
            LocalMixingService.store = original_store

    def test_oil_batch_requires_units_per_container(self):
        response = self.client.post(
            "/api/batches",
            {
                "brandId": self.batch_id,
                "productId": self.batch_id,
                "dosageForm": "oil",
                "containerCount": 10,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("unitsPerContainer", response.json()["details"])

    @patch("apps.batches.views.MixingService.create_for_batch")
    def test_mixing_accepts_the_original_frontend_usage_shape(self, mocked_create):
        mocked_create.return_value = {"id": self.batch_id}
        response = self.client.post(
            f"/api/batches/{self.batch_id}/mixing",
            {
                "rmUsage": [
                    {
                        "rawMaterialId": self.batch_id,
                        "rawMaterialName": "Zinc",
                        "requiredQtyKgThisMix": "1.2500",
                    }
                ],
                "nonMedUsage": [
                    {
                        "name": "Silica",
                        "requiredQtyKgThisMix": "0.1000",
                    }
                ],
                "mixingDates": ["2026-06-24"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        payload = mocked_create.call_args.args[1]
        self.assertEqual(float(payload["rmUsage"][0]["requiredQtyKgThisMix"]), 1.25)
        self.assertIsNone(payload["nonMedUsage"][0].get("rawMaterialId"))

    @patch("apps.batches.views.MixingService.update_for_batch")
    def test_mixing_report_supports_old_service_update_contract(self, mocked_update):
        mocked_update.return_value = {"id": self.batch_id, "mixingNotes": "Updated"}

        response = self.client.put(
            f"/api/batches/{self.batch_id}/mixing",
            {"mixingNotes": "Updated"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once_with(
            self.batch_id,
            {"mixingNotes": "Updated"},
        )

    @patch("apps.batches.views.NJPService.list")
    def test_njp_report_list_supports_frontend_filters(self, mocked_list):
        mocked_list.return_value = []
        response = self.client.get(
            f"/api/batches/njp-reports?batchId={self.batch_id}&limit=25"
        )
        self.assertEqual(response.status_code, 200)
        mocked_list.assert_called_once_with(
            filters={"batch_id": self.batch_id},
            limit=25,
        )

    @patch("apps.batches.views.NJPService.update_for_batch")
    def test_njp_report_can_be_updated_by_batch(self, mocked_update):
        report_id = "22222222-2222-2222-2222-222222222222"
        mocked_update.return_value = {"id": report_id, "remarks": "updated"}
        response = self.client.put(
            f"/api/batches/{self.batch_id}/njp",
            {"remarks": "updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once_with(self.batch_id, {"remarks": "updated"})

    @patch("apps.batches.views.StageLifecycleService.start_stage")
    def test_stage_start_endpoint_records_lifecycle(self, mocked_start):
        mocked_start.return_value = {"stage": "mixing", "report": {"id": self.batch_id}}
        response = self.client.post(
            f"/api/batches/{self.batch_id}/stages/mixing/start",
            {"startDate": 1782518400000, "startTime": "09:15", "remarks": "Started"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        mocked_start.assert_called_once_with(
            self.batch_id,
            "mixing",
            {"startDate": 1782518400000, "startTime": "09:15", "remarks": "Started"},
        )

    @patch("apps.batches.views.StageLifecycleService.update_stage")
    def test_stage_lifecycle_endpoint_updates_stage_timing(self, mocked_update):
        mocked_update.return_value = {"stage": "mixing", "report": {"id": self.batch_id}}
        response = self.client.put(
            f"/api/batches/{self.batch_id}/stages/mixing/lifecycle",
            {
                "startDate": 1782518400000,
                "startTime": "09:15",
                "endDate": 1782604800000,
                "endTime": "18:10",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once_with(
            self.batch_id,
            "mixing",
            {
                "startDate": 1782518400000,
                "startTime": "09:15",
                "endDate": 1782604800000,
                "endTime": "18:10",
            },
        )

    @patch("services.batch_service.BatchService.update")
    @patch("services.batch_service.NJPService.get_by_batch")
    @patch("services.batch_service.BatchService.get")
    @patch("services.inventory_service.FinishedGoodsService.transition_to_capsule")
    def test_njp_save_transitions_finished_goods_to_capsules(
        self,
        mocked_transition,
        mocked_batch_get,
        mocked_get_by_batch,
        mocked_batch_update,
    ):
        def fake_create(service_class, payload):
            return {"id": "report-id", **payload}

        mocked_get_by_batch.side_effect = ServiceError("NJP report not found", 404)
        mocked_batch_get.return_value = {
            "id": self.batch_id,
            "hasMixing": True,
            "brandId": "33333333-3333-3333-3333-333333333333",
            "productId": "44444444-4444-4444-4444-444444444444",
            "batchCode": "BV001",
            "brandName": "BorealVita",
            "productName": "Capsules",
        }

        with patch(
            "services.batch_service.TableService.create",
            new=classmethod(fake_create),
        ):
            NJPService.create_for_batch(
                self.batch_id,
                {
                    "totalCapsulesFilledQty": 900,
                    "targetFillWeightMg": "500.0000",
                    "totalCapsulesProducedKg": "1.2500",
                },
            )

        mocked_batch_update.assert_called_once_with(
            self.batch_id,
            {
                "hasNJP": True,
                "status": "assemblyPending",
                "batchStatus": "NJP Completed",
                "currentStage": "assembly",
                "batchRemarks": None,
                "reason": None,
            },
        )
        mocked_transition.assert_called_once_with(
            self.batch_id,
            capsule_code="BV001",
            capsule_mg=500.0,
            capsule_weight_kg=1.25,
            capsule_amount=900,
        )
