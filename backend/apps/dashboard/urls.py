from django.urls import path

from .views import DashboardStatsView, LowStockView, PendingWorkView, RecentBatchesView


urlpatterns = [
    path("", DashboardStatsView.as_view(), name="dashboard"),
    path("stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("low-stock/", LowStockView.as_view(), name="dashboard-low-stock"),
    path("recent-batches/", RecentBatchesView.as_view(), name="dashboard-recent-batches"),
    path("pending-work/", PendingWorkView.as_view(), name="dashboard-pending-work"),
]
