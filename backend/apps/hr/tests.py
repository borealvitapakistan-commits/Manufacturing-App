from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from services.hr_service import EmployeeService, TimeEntryService


class HRAPITests(SimpleTestCase):
    employee_id = "11111111-1111-1111-1111-111111111111"
    entry_id = "22222222-2222-2222-2222-222222222222"

    def setUp(self):
        self.client = APIClient()

    @patch("apps.hr.views.SalarySheetService.generate")
    def test_salary_generation_is_server_owned(self, mocked_generate):
        mocked_generate.return_value = {
            "id": self.employee_id,
            "netPayable": 45000,
        }
        response = self.client.post(
            "/api/salary-sheets/generate",
            {
                "employeeId": self.employee_id,
                "year": 2026,
                "month": 6,
                "loanDeduction": "5000.00",
                "locked": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        mocked_generate.assert_called_once()

    @patch("apps.hr.views.EmployeeLoanService.save_with_expense")
    def test_loan_and_expense_rpc_endpoint(self, mocked_save):
        response = self.client.post(
            "/api/employee-loans/with-expense",
            {
                "employeeId": self.employee_id,
                "amount": "1000.00",
                "note": "Advance",
                "bookId": "22222222-2222-2222-2222-222222222222",
                "givenFrom": "Main cash",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        mocked_save.assert_called_once()

    @patch("apps.hr.views.EmployeeService.create")
    def test_employee_accepts_blank_optional_primary_brand(self, mocked_create):
        mocked_create.return_value = {"id": self.employee_id, "fullName": "Ali"}
        response = self.client.post(
            "/api/employees",
            {
                "fullName": "Ali",
                "primaryBrandId": "",
                "brandIds": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(mocked_create.call_args.args[0]["primaryBrandId"])

    @patch("apps.hr.views.WorkEntryService.create")
    def test_work_entry_accepts_blank_optional_brand(self, mocked_create):
        mocked_create.return_value = {"id": self.entry_id}
        response = self.client.post(
            "/api/work-entries",
            {
                "employeeId": self.employee_id,
                "brandId": "",
                "date": 1782259200000,
                "description": "Packing",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(mocked_create.call_args.args[0]["brandId"])

    @patch("apps.hr.views.WorkEntryService.update")
    def test_work_entry_detail_supports_original_put_contract(self, mocked_update):
        mocked_update.return_value = {"id": self.entry_id, "description": "Updated"}
        response = self.client.put(
            f"/api/work-entries/{self.entry_id}",
            {"description": "Updated"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once_with(
            self.entry_id,
            {"description": "Updated"},
        )

    @patch("apps.hr.views.EmployeeLoanService.update")
    def test_employee_loan_detail_supports_original_put_contract(self, mocked_update):
        mocked_update.return_value = {"id": self.entry_id, "amount": "500.00"}
        response = self.client.put(
            f"/api/employee-loans/{self.entry_id}",
            {"amount": "500.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mocked_update.assert_called_once()


class HRServiceTests(SimpleTestCase):
    def test_employee_partial_update_does_not_reset_pay_defaults(self):
        self.assertEqual(
            EmployeeService._normalize({"phone": " 123 "}, partial=True),
            {"phone": "123"},
        )

    def test_attendance_status_and_hours_are_derived_like_old_frontend(self):
        present = TimeEntryService._normalize(
            {"timeIn": "09:00", "timeOut": "17:30"}
        )
        leave = TimeEntryService._normalize(
            {"timeIn": "09:00", "leaveType": "sick"}
        )

        self.assertEqual(present["status"], "present")
        self.assertEqual(present["hoursWorked"], 8.5)
        self.assertEqual(leave["status"], "leave")
        self.assertIsNone(leave["timeIn"])

    @patch.object(TimeEntryService, "create")
    @patch.object(TimeEntryService, "client")
    def test_first_attendance_entry_creates_when_maybe_single_returns_none(
        self,
        mocked_client,
        mocked_create,
    ):
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.maybe_single.return_value = query
        query.execute.return_value = None
        mocked_client.return_value.table.return_value = query
        mocked_create.return_value = {"id": "entry-id"}

        result = TimeEntryService.save(
            {
                "employeeId": "11111111-1111-1111-1111-111111111111",
                "date": 1782259200000,
                "timeIn": "09:00",
                "timeOut": "17:30",
            }
        )

        self.assertEqual(result["id"], "entry-id")
        mocked_create.assert_called_once()
