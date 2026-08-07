from django.urls import path

from .views import (
    AdjustStockView,
    BottleLidListCreateView,
    BottleLidDetailView,
    InventoryHistoryView,
    FinishedGoodsDetailView,
    FinishedGoodsListCreateView,
    LabelDetailView,
    LabelListCreateView,
    LabelValidationView,
    InventoryRecordListView,
    LowStockView,
    ManualAdjustmentView,
    RawMaterialByCodeView,
    RawMaterialCategoryDetailView,
    RawMaterialCategoryListCreateView,
    RawMaterialDetailView,
    RawMaterialListCreateView,
    SetStockView,
)


urlpatterns = [
    path("", FinishedGoodsListCreateView.as_view(), name="finished-goods-list-create"),
    path("history/", InventoryHistoryView.as_view(), name="inventory-history"),
    path("records/<str:record_type>/", InventoryRecordListView.as_view(), name="inventory-record-list"),
    path("manual-adjustment/", ManualAdjustmentView.as_view(), name="inventory-manual-adjustment"),
    path("labels/", LabelListCreateView.as_view(), name="inventory-label-list-create"),
    path("labels/validate/", LabelValidationView.as_view(), name="inventory-label-validate"),
    path("labels/<uuid:item_id>/", LabelDetailView.as_view(), name="inventory-label-detail"),
    path("raw-materials/", RawMaterialListCreateView.as_view(), name="inventory-raw-material-list-create"),
    path(
        "raw-materials/categories/",
        RawMaterialCategoryListCreateView.as_view(),
        name="inventory-raw-material-category-list-create",
    ),
    path(
        "raw-materials/categories/<uuid:item_id>/",
        RawMaterialCategoryDetailView.as_view(),
        name="inventory-raw-material-category-detail",
    ),
    path("raw-materials/low-stock/", LowStockView.as_view(), name="inventory-raw-material-low-stock"),
    path("raw-materials/adjust-stock/", AdjustStockView.as_view(), name="inventory-raw-material-adjust-stock"),
    path("raw-materials/set-stock/", SetStockView.as_view(), name="inventory-raw-material-set-stock"),
    path("raw-materials/by-code/<str:code>/", RawMaterialByCodeView.as_view(), name="inventory-raw-material-by-code"),
    path("raw-materials/<uuid:item_id>/", RawMaterialDetailView.as_view(), name="inventory-raw-material-detail"),
    path("bottles-lids/", BottleLidListCreateView.as_view(), name="inventory-bottles-lids-list"),
    path("bottles-lids/<uuid:item_id>/", BottleLidDetailView.as_view(), name="inventory-bottles-lids-detail"),
    path("<uuid:item_id>/", FinishedGoodsDetailView.as_view(), name="finished-goods-detail"),
]
