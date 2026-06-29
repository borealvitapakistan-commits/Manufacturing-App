from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.finance_service import ExpenseBookService, ExpenseService


class FinanceAPITests(SimpleTestCase):
    book_id = "11111111-1111-1111-1111-111111111111"

    def setUp(self):
        self.client = APIClient()

    @patch("apps.finance.views.ExpenseBookService.close")
    def test_close_book_supports_pending_carry_mode(self, mocked_close):
        mocked_close.return_value = {
            "book": {"id": self.book_id, "status": "closed"},
            "targetBook": None,
        }
        response = self.client.post(
            f"/api/expense-books/{self.book_id}/close",
            {"mode": "later"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mocked_close.assert_called_once_with(
            self.book_id,
            mode="later",
            target_book_id=None,
            new_book_name=None,
            source_description=None,
        )

    def test_transfer_close_requires_target(self):
        response = self.client.post(
            f"/api/expense-books/{self.book_id}/close",
            {"mode": "transfer"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_expense_requires_nonblank_description(self):
        response = self.client.post(
            "/api/expenses",
            {
                "bookId": self.book_id,
                "date": 1782259200000,
                "description": " ",
                "amount": "100.00",
                "direction": "debit",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class ExpenseBookServiceTests(SimpleTestCase):
    @patch.object(ExpenseBookService, "update")
    @patch.object(ExpenseBookService, "balance")
    @patch.object(ExpenseBookService, "get")
    def test_close_later_uses_existing_book_columns(
        self,
        mocked_get,
        mocked_balance,
        mocked_update,
    ):
        mocked_get.return_value = {
            "id": "book-id",
            "name": "Main",
            "status": "open",
            "isActive": True,
        }
        mocked_balance.return_value = {"balance": 125.5}
        mocked_update.return_value = {
            "id": "book-id",
            "status": "closed",
            "hasPendingCarry": True,
            "pendingCarryAmount": 125.5,
        }

        result = ExpenseBookService.close("book-id", mode="later")

        update_payload = mocked_update.call_args.args[1]
        self.assertTrue(update_payload["hasPendingCarry"])
        self.assertEqual(update_payload["pendingCarryAmount"], 125.5)
        self.assertEqual(result["book"]["status"], "closed")

    @patch.object(ExpenseBookService, "update")
    @patch.object(ExpenseService, "create")
    @patch.object(ExpenseBookService, "get")
    def test_negative_pending_carry_credits_target_book(
        self,
        mocked_get,
        mocked_create_expense,
        mocked_update,
    ):
        source = {
            "id": "source-id",
            "name": "May",
            "hasPendingCarry": True,
            "pendingCarryAmount": -250,
        }
        target = {
            "id": "target-id",
            "name": "June",
            "status": "open",
            "isActive": True,
        }
        mocked_get.side_effect = [source, target]
        mocked_update.return_value = {**source, "hasPendingCarry": False}

        ExpenseBookService.pull_carry("source-id", "target-id")

        entry = mocked_create_expense.call_args.args[0]
        self.assertEqual(entry["bookId"], "target-id")
        self.assertEqual(entry["direction"], "credit")
        self.assertEqual(entry["amount"], 250)
