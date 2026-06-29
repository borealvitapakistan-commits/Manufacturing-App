from django.urls import path

from .views import (
    FinishedGoodsDetailView,
    FinishedGoodsListCreateView,
    FinishedGoodByBatchView,
    InventoryHistoryView,
    ManualAdjustmentView,
)


urlpatterns = [
    path("", FinishedGoodsListCreateView.as_view(), name="finished-goods-list-create"),
    path("history/", InventoryHistoryView.as_view(), name="inventory-history"),
    path("manual-adjustment/", ManualAdjustmentView.as_view(), name="inventory-manual-adjustment"),
    path("by-batch/<uuid:batch_id>/", FinishedGoodByBatchView.as_view(), name="finished-good-by-batch"),
    path("<uuid:item_id>/", FinishedGoodsDetailView.as_view(), name="finished-goods-detail"),
]
