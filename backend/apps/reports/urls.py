from django.urls import path

from .views import (
    AssemblyReportDetailView,
    AssemblyReportListView,
    MixingReportDetailView,
    MixingReportListView,
    NJPReportDetailView,
    NJPReportListView,
)


urlpatterns = [
    path("mixing/", MixingReportListView.as_view(), name="report-mixing-list"),
    path("mixing/<str:item_id>/", MixingReportDetailView.as_view(), name="report-mixing-detail"),
    path("njp/", NJPReportListView.as_view(), name="report-njp-list"),
    path("njp/<str:item_id>/", NJPReportDetailView.as_view(), name="report-njp-detail"),
    path("assembly/", AssemblyReportListView.as_view(), name="report-assembly-list"),
    path("assembly/<str:item_id>/", AssemblyReportDetailView.as_view(), name="report-assembly-detail"),
]
