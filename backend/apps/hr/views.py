from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView
from services.hr_service import (
    EmployeeLoanService,
    EmployeeService,
    SalarySheetService,
    TimeEntryService,
    WorkEntryService,
)

from .serializers import (
    EmployeeLoanSerializer,
    EmployeeSerializer,
    GenerateSalarySerializer,
    LoanWithExpenseSerializer,
    SalarySheetSerializer,
    TimeEntrySerializer,
    WorkEntrySerializer,
)


class EmployeeListCreateView(TableListCreateView):
    service_class = EmployeeService
    serializer_class = EmployeeSerializer
    filter_map = {"active": "is_active", "primaryBrandId": "primary_brand_id"}
    search_column = "full_name"


class EmployeeDetailView(TableDetailView):
    service_class = EmployeeService
    serializer_class = EmployeeSerializer


class TimeEntryListCreateView(TableListCreateView):
    service_class = TimeEntryService
    serializer_class = TimeEntrySerializer
    filter_map = {"employeeId": "employee_id", "status": "status"}

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"data": TimeEntryService.save(serializer.validated_data)}, status=201)


class WorkEntryListCreateView(TableListCreateView):
    service_class = WorkEntryService
    serializer_class = WorkEntrySerializer
    filter_map = {"employeeId": "employee_id", "brandId": "brand_id"}


class WorkEntryDetailView(TableDetailView):
    service_class = WorkEntryService
    serializer_class = WorkEntrySerializer


class SalarySheetListCreateView(TableListCreateView):
    service_class = SalarySheetService
    serializer_class = SalarySheetSerializer
    filter_map = {"employeeId": "employee_id", "year": "year", "month": "month"}


class SalarySheetDetailView(TableDetailView):
    service_class = SalarySheetService
    serializer_class = SalarySheetSerializer


class LockSalarySheetView(APIView):
    def post(self, request, item_id):
        return Response({"data": SalarySheetService.update(str(item_id), {"locked": True})})


class EmployeeLoanListCreateView(TableListCreateView):
    service_class = EmployeeLoanService
    serializer_class = EmployeeLoanSerializer
    filter_map = {"employeeId": "employee_id"}


class EmployeeLoanDetailView(TableDetailView):
    service_class = EmployeeLoanService
    serializer_class = EmployeeLoanSerializer


class GenerateSalarySheetView(APIView):
    def post(self, request):
        serializer = GenerateSalarySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        data = SalarySheetService.generate(
            employee_id=str(values["employeeId"]),
            year=values["year"],
            month=values["month"],
            other_deductions=float(values["otherDeductions"]),
            loan_deduction=float(values["loanDeduction"]),
            overtime_pay=float(values["overtimePay"]),
            bonus=float(values["bonus"]),
            notes=values.get("notes"),
            locked=values["locked"],
        )
        return Response({"data": data}, status=201)


class LoanWithExpenseView(APIView):
    def post(self, request):
        serializer = LoanWithExpenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        EmployeeLoanService.save_with_expense(
            employee_id=str(values["employeeId"]),
            amount=float(values["amount"]),
            note=values.get("note", ""),
            book_id=str(values["bookId"]),
            given_from=values["givenFrom"],
        )
        return Response({"data": {"success": True}}, status=201)
