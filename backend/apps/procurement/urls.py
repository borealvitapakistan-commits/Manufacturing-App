from django.urls import path

from .views import (
    CompanySettingsView,
    PostPurchaseOrderView,
    PODocumentDetailView,
    PODocumentListCreateView,
    PurchaseOrderDetailView,
    PurchaseOrderListCreateView,
    VendorDetailView,
    VendorListCreateView,
)


urlpatterns = [
    path("company-settings/", CompanySettingsView.as_view(), name="company-settings"),
    path("vendors/", VendorListCreateView.as_view(), name="vendor-list-create"),
    path("vendors/<uuid:item_id>/", VendorDetailView.as_view(), name="vendor-detail"),
    path("purchase-orders/", PurchaseOrderListCreateView.as_view(), name="po-list-create"),
    path("purchase-orders/<uuid:item_id>/", PurchaseOrderDetailView.as_view(), name="po-detail"),
    path(
        "purchase-orders/<uuid:item_id>/post-to-inventory/",
        PostPurchaseOrderView.as_view(),
        name="po-post-inventory",
    ),
    path("po-documents/", PODocumentListCreateView.as_view(), name="po-document-list-create"),
    path("po-documents/<uuid:item_id>/", PODocumentDetailView.as_view(), name="po-document-detail"),
]
