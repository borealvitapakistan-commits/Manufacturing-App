from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from apps.inventory.services.finished_goods import FinishedGoodsService
from services.base_service import ServiceError


class InventoryAPITests(SimpleTestCase):
    item_id = "11111111-1111-1111-1111-111111111111"

    def setUp(self):
        self.client = APIClient()

    def test_manual_adjustment_requires_reason(self):
        response = self.client.post(
            "/api/finished-goods/manual-adjustment",
            {"finishedGoodId": self.item_id, "changes": {"bottleTotal": 12}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("apps.inventory.views.finished_goods.FinishedGoodsService.update_with_history")
    def test_manual_adjustment_calls_history_service(self, mocked_update):
        mocked_update.return_value = {"id": self.item_id, "bottleTotal": 12}
        response = self.client.post(
            "/api/finished-goods/manual-adjustment",
            {
                "finishedGoodId": self.item_id,
                "changes": {"bottleTotal": 12},
                "reason": "Physical stock count",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once()


class FinishedGoodsServiceTests(SimpleTestCase):
    def test_manual_update_is_blocked_for_generated_finished_goods(self):
        with self.assertRaisesMessage(
            ServiceError,
            "Finished goods are generated from Mixing, Encapsulation, and Assembly records",
        ):
            FinishedGoodsService.update_with_history(
                "finished-id",
                {"bottleTotal": 10},
                reason="Stock count",
            )

    def test_manual_delete_is_blocked_for_generated_finished_goods(self):
        with self.assertRaisesMessage(
            ServiceError,
            "Finished goods are generated from Mixing, Encapsulation, and Assembly records",
        ):
            FinishedGoodsService.delete("finished-id")
