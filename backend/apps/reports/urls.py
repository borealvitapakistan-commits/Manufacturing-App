from django.urls import path

from .views import (
    BatchPricingView,
    BatchTraceabilityView,
    ExpenseSummaryView,
    InventorySummaryView,
    PayrollSummaryView,
    PurchaseOrderReportView,
)


urlpatterns = [
    path("batch-pricing/<uuid:batch_id>/", BatchPricingView.as_view(), name="report-batch-pricing"),
    path(
        "batch-traceability/<uuid:batch_id>/",
        BatchTraceabilityView.as_view(),
        name="report-batch-traceability",
    ),
    path("inventory-summary/", InventorySummaryView.as_view(), name="report-inventory"),
    path("payroll-summary/", PayrollSummaryView.as_view(), name="report-payroll"),
    path("expense-summary/", ExpenseSummaryView.as_view(), name="report-expense"),
    path(
        "purchase-order/<uuid:po_id>/",
        PurchaseOrderReportView.as_view(),
        name="report-purchase-order",
    ),
]
