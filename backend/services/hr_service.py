from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .base_service import ServiceError, TableService, translate_error
from .converters import to_json_value


class EmployeeService(TableService):
    table_name = "employees"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "full_name")
        kwargs.setdefault("descending", False)
        return super().list(**kwargs)

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        return super().create(cls._normalize(payload))

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return super().update(item_id, cls._normalize(payload, partial=True))

    @staticmethod
    def _normalize(payload: dict[str, Any], partial: bool = False) -> dict[str, Any]:
        normalized = dict(payload)
        if "fullName" in normalized:
            normalized["fullName"] = str(normalized["fullName"] or "").strip()
            if not normalized["fullName"]:
                raise ServiceError("Employee name is required", 400)
        elif not partial:
            raise ServiceError("Employee name is required", 400)
        if "brandIds" in normalized:
            normalized["brandIds"] = [str(value) for value in normalized["brandIds"]]
        if "brandIds" in normalized or "primaryBrandId" in normalized:
            EmployeeService._validate_brand_relationships(normalized)
        for key in ("phone", "email", "roleTitle", "notes"):
            if key in normalized:
                normalized[key] = str(normalized[key] or "").strip() or None
        if not partial:
            normalized.setdefault("currency", "PKR")
            normalized.setdefault("payType", "monthly")
            normalized.setdefault("isActive", True)
        return normalized

    @staticmethod
    def _validate_brand_relationships(payload: dict[str, Any]) -> None:
        brand_ids = [str(value) for value in (payload.get("brandIds") or [])]
        primary = str(payload.get("primaryBrandId") or "").strip() or None
        ids_to_check = set(brand_ids)
        if primary:
            ids_to_check.add(primary)
        if not ids_to_check:
            return
        try:
            response = (
                EmployeeService.client()
                .table("brands")
                .select("id")
                .in_("id", list(ids_to_check))
                .execute()
            )
        except Exception as error:
            raise translate_error(error) from error
        found = {str(row["id"]) for row in (response.data or [])}
        missing = ids_to_check - found
        if missing:
            raise ServiceError("One or more selected employee brands do not exist", 400)


class TimeEntryService(TableService):
    table_name = "time_entries"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "date")
        kwargs.setdefault("descending", True)
        return super().list(**kwargs)

    @staticmethod
    def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        status = normalized.get("status") or "absent"
        time_in = str(normalized.get("timeIn") or "").strip() or None
        time_out = str(normalized.get("timeOut") or "").strip() or None
        leave_type = str(normalized.get("leaveType") or "").strip() or None

        if leave_type and leave_type != "none":
            status = "leave"
            time_in = None
            time_out = None
            normalized["hoursWorked"] = None
        elif time_in or time_out:
            status = "present"
            if time_in and time_out:
                try:
                    in_hour, in_minute = [int(value) for value in time_in.split(":", 1)]
                    out_hour, out_minute = [int(value) for value in time_out.split(":", 1)]
                except (TypeError, ValueError):
                    raise ServiceError("Attendance times must use HH:MM format", 400)
                start = in_hour * 60 + in_minute
                end = out_hour * 60 + out_minute
                normalized["hoursWorked"] = (
                    round((end - start) / 60, 2) if end > start else 0
                )

        normalized.update(
            {
                "status": status,
                "timeIn": time_in,
                "timeOut": time_out,
                "leaveType": leave_type if status == "leave" else None,
            }
        )
        return normalized

    @classmethod
    def save(cls, payload: dict[str, Any]) -> dict[str, Any]:
        payload = cls._normalize(payload)
        employee_id = str(payload["employeeId"])
        entry_date = payload.get("date")
        if entry_date is not None:
            try:
                response = (
                    cls.client()
                    .table(cls.table_name)
                    .select("id")
                    .eq("employee_id", employee_id)
                    .eq("date", entry_date)
                    .maybe_single()
                    .execute()
                )
                data = getattr(response, "data", None)
                if data:
                    return cls.update(str(data["id"]), payload)
            except Exception as error:
                raise translate_error(error) from error
        return cls.create(payload)


class WorkEntryService(TableService):
    table_name = "work_entries"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "date")
        kwargs.setdefault("descending", True)
        return super().list(**kwargs)


class EmployeeLoanService(TableService):
    table_name = "employee_loans"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "date")
        kwargs.setdefault("descending", True)
        return super().list(**kwargs)

    @classmethod
    def save_with_expense(
        cls,
        *,
        employee_id: str,
        amount: float,
        note: str,
        book_id: str,
        given_from: str,
    ) -> None:
        if amount <= 0:
            raise ServiceError("Loan amount must be greater than zero", 400)
        try:
            cls.client().rpc(
                "save_loan_with_expense",
                {
                    "p_employee_id": employee_id,
                    "p_amount": amount,
                    "p_note": note,
                    "p_book_id": book_id,
                    "p_given_from": given_from,
                },
            ).execute()
        except Exception as error:
            raise translate_error(error) from error


class SalarySheetService(TableService):
    table_name = "salary_sheets"

    @classmethod
    def list(cls, **kwargs):
        kwargs.setdefault("order_by", "year")
        kwargs.setdefault("descending", True)
        return super().list(**kwargs)

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = cls.get(item_id)
        if existing.get("locked"):
            raise ServiceError("Locked salary sheets cannot be edited", 409)
        return super().update(item_id, payload)

    @classmethod
    def generate(
        cls,
        *,
        employee_id: str,
        year: int,
        month: int,
        other_deductions: float = 0,
        loan_deduction: float = 0,
        overtime_pay: float = 0,
        bonus: float = 0,
        notes: str | None = None,
        locked: bool = False,
    ) -> dict[str, Any]:
        employee = EmployeeService.get(employee_id)
        start = int(datetime(year, month, 1, tzinfo=UTC).timestamp() * 1000)
        if month == 12:
            end_dt = datetime(year + 1, 1, 1, tzinfo=UTC)
        else:
            end_dt = datetime(year, month + 1, 1, tzinfo=UTC)
        end = int(end_dt.timestamp() * 1000) - 1

        try:
            attendance_response = (
                cls.client()
                .table("time_entries")
                .select("*")
                .eq("employee_id", employee_id)
                .gte("date", start)
                .lte("date", end)
                .execute()
            )
            work_response = (
                cls.client()
                .table("work_entries")
                .select("*")
                .eq("employee_id", employee_id)
                .gte("date", start)
                .lte("date", end)
                .execute()
            )
            existing_response = (
                cls.client()
                .table(cls.table_name)
                .select("*")
                .eq("employee_id", employee_id)
                .eq("year", year)
                .eq("month", month)
                .maybe_single()
                .execute()
            )
        except Exception as error:
            raise translate_error(error) from error

        attendance = attendance_response.data or []
        work = work_response.data or []
        present = sum(1 for row in attendance if row.get("status") == "present")
        leave = sum(1 for row in attendance if row.get("status") == "leave")
        hours = round(
            sum(
                float(row.get("hours_worked") or 0)
                for row in attendance
                if row.get("status") == "present"
            ),
            2,
        )
        tasks = round(sum(float(row.get("quantity") or 0) for row in work), 2)

        pay_type = employee.get("payType")
        if pay_type == "hourly":
            base_salary = float(employee.get("hourlyRate") or 0) * hours
        elif pay_type == "perTask":
            base_salary = float(employee.get("perTaskRate") or 0) * tasks
        else:
            base_salary = float(employee.get("baseSalaryMonthly") or 0)
        base_salary = round(base_salary, 2)
        net = max(
            0,
            base_salary
            + float(overtime_pay)
            + float(bonus)
            - float(other_deductions)
            - float(loan_deduction),
        )

        payload = {
            "employeeId": employee_id,
            "year": year,
            "month": month,
            "totalDaysPresent": present,
            "totalDaysLeave": leave,
            "totalHoursWorked": hours,
            "totalTasks": tasks,
            "baseSalary": base_salary,
            "overtimePay": overtime_pay or None,
            "bonus": bonus or None,
            "totalLoanDeduction": loan_deduction,
            "otherDeductions": other_deductions,
            "netPayable": round(net, 2),
            "currency": employee.get("currency") or "PKR",
            "notes": notes,
            "locked": locked,
        }

        existing = getattr(existing_response, "data", None)
        if existing:
            if existing.get("locked"):
                raise ServiceError("A locked salary sheet already exists for this period", 409)
            sheet = super().update(str(existing["id"]), payload)
        else:
            sheet = super().create(payload)

        if loan_deduction > 0:
            description = f"Deducted from {year:04d}-{month:02d} salary"
            try:
                loan_response = (
                    cls.client()
                    .table("employee_loans")
                    .select("id")
                    .eq("salary_sheet_id", sheet["id"])
                    .maybe_single()
                    .execute()
                )
            except Exception as error:
                raise translate_error(error) from error
            loan_payload = {
                "employeeId": employee_id,
                "amount": -abs(float(loan_deduction)),
                "description": description,
                "salarySheetId": sheet["id"],
                "date": start,
            }
            loan = getattr(loan_response, "data", None)
            if loan:
                EmployeeLoanService.update(str(loan["id"]), loan_payload)
            else:
                EmployeeLoanService.create(loan_payload)
        return sheet
