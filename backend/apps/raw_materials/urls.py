from django.urls import path

from .views import (
    AdjustStockView,
    LowStockView,
    RawMaterialByCodeView,
    RawMaterialDetailView,
    RawMaterialListCreateView,
    SetStockView,
)


urlpatterns = [
    path("", RawMaterialListCreateView.as_view(), name="raw-material-list-create"),
    path("low-stock/", LowStockView.as_view(), name="raw-material-low-stock"),
    path("adjust-stock/", AdjustStockView.as_view(), name="raw-material-adjust-stock"),
    path("set-stock/", SetStockView.as_view(), name="raw-material-set-stock"),
    path("by-code/<str:code>/", RawMaterialByCodeView.as_view(), name="raw-material-by-code"),
    path("<uuid:item_id>/", RawMaterialDetailView.as_view(), name="raw-material-detail"),
]
