from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.base_service import ServiceError
from services.inventory_service import FinishedGoodsService


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

    @patch("apps.inventory.views.FinishedGoodsService.update_with_history")
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
    @patch.object(FinishedGoodsService, "get")
    @patch.object(FinishedGoodsService, "_record_history")
    def test_manual_update_allows_stock_only_change_like_old_frontend(
        self,
        mocked_record_history,
        mocked_get,
    ):
        mocked_get.return_value = {
            "id": "finished-id",
            "name": "Product",
            "location": "",
            "bottleTotal": 8,
        }

        with patch(
            "services.inventory_service.TableService.update",
            new=classmethod(lambda service_class, item_id, payload: {**mocked_get.return_value, **payload}),
        ):
            result = FinishedGoodsService.update_with_history(
                "finished-id",
                {"bottleTotal": 10},
                reason="Stock count",
            )

        self.assertEqual(result["bottleTotal"], 10)
        mocked_record_history.assert_called_once()

    @patch.object(FinishedGoodsService, "get")
    def test_manual_update_still_requires_reason(self, mocked_get):
        mocked_get.return_value = {"id": "finished-id", "bottleTotal": 8}

        with self.assertRaisesMessage(ServiceError, "Reason is required"):
            FinishedGoodsService.update_with_history(
                "finished-id",
                {"bottleTotal": 10},
                reason="",
            )
