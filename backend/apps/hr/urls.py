from django.urls import path

from .views import (
    EmployeeDetailView,
    EmployeeListCreateView,
    EmployeeLoanDetailView,
    EmployeeLoanListCreateView,
    GenerateSalarySheetView,
    LoanWithExpenseView,
    LockSalarySheetView,
    SalarySheetDetailView,
    SalarySheetListCreateView,
    TimeEntryListCreateView,
    WorkEntryDetailView,
    WorkEntryListCreateView,
)


urlpatterns = [
    path("employees/", EmployeeListCreateView.as_view(), name="employee-list-create"),
    path("employees/<uuid:item_id>/", EmployeeDetailView.as_view(), name="employee-detail"),
    path("time-entries/", TimeEntryListCreateView.as_view(), name="time-entry-list-create"),
    path("work-entries/", WorkEntryListCreateView.as_view(), name="work-entry-list-create"),
    path("work-entries/<uuid:item_id>/", WorkEntryDetailView.as_view(), name="work-entry-detail"),
    path("salary-sheets/", SalarySheetListCreateView.as_view(), name="salary-sheet-list-create"),
    path("salary-sheets/generate/", GenerateSalarySheetView.as_view(), name="salary-sheet-generate"),
    path("salary-sheets/<uuid:item_id>/", SalarySheetDetailView.as_view(), name="salary-sheet-detail"),
    path("salary-sheets/<uuid:item_id>/lock/", LockSalarySheetView.as_view(), name="salary-sheet-lock"),
    path("employee-loans/", EmployeeLoanListCreateView.as_view(), name="employee-loan-list-create"),
    path("employee-loans/<uuid:item_id>/", EmployeeLoanDetailView.as_view(), name="employee-loan-detail"),
    path("employee-loans/with-expense/", LoanWithExpenseView.as_view(), name="employee-loan-with-expense"),
]
