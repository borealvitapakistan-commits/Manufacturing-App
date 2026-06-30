from django.urls import path

from .views import (
    AssemblyView,
    AssemblyReportListView,
    BatchDetailView,
    BatchListCreateView,
    MixingView,
    MixingReportListView,
    NJPView,
    NJPReportListView,
    StageEndView,
    StageLifecycleUpdateView,
    StageStartView,
    TimelineView,
    ValidateLabelsView,
    ValidateStockView,
)
from apps.reports.views import BatchPricingView


urlpatterns = [
    path("", BatchListCreateView.as_view(), name="batch-list-create"),
    path("mixing-reports/", MixingReportListView.as_view(), name="mixing-report-list"),
    path("njp-reports/", NJPReportListView.as_view(), name="njp-report-list"),
    path("assembly-reports/", AssemblyReportListView.as_view(), name="assembly-report-list"),
    path("<uuid:item_id>/", BatchDetailView.as_view(), name="batch-detail"),
    path("<uuid:item_id>/validate-stock/", ValidateStockView.as_view(), name="batch-validate-stock"),
    path("<uuid:item_id>/validate-labels/", ValidateLabelsView.as_view(), name="batch-validate-labels"),
    path("<uuid:item_id>/stages/<str:stage>/start/", StageStartView.as_view(), name="batch-stage-start"),
    path("<uuid:item_id>/stages/<str:stage>/lifecycle/", StageLifecycleUpdateView.as_view(), name="batch-stage-lifecycle"),
    path("<uuid:item_id>/stages/<str:stage>/end/", StageEndView.as_view(), name="batch-stage-end"),
    path("<uuid:item_id>/mixing/", MixingView.as_view(), name="batch-mixing"),
    path("<uuid:item_id>/njp/", NJPView.as_view(), name="batch-njp"),
    path("<uuid:item_id>/assembly/", AssemblyView.as_view(), name="batch-assembly"),
    path("<uuid:item_id>/timeline/", TimelineView.as_view(), name="batch-timeline"),
    path("<uuid:item_id>/traceability/", TimelineView.as_view(), name="batch-traceability"),
    path("<uuid:batch_id>/pricing/", BatchPricingView.as_view(), name="batch-pricing"),
]
