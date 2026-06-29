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
