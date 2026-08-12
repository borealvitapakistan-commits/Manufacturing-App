from django.urls import path

from .views import (
    PODocumentDetailView,
    PODocumentHistoryView,
    PODocumentListCreateView,
    RequestToQuoteApproveView,
    RequestToQuoteDetailView,
    RequestToQuoteHistoryView,
    RequestToQuoteListCreateView,
    SentItemDetailView,
    SentItemListCreateView,
    SentItemSourcesView,
    VendorDetailView,
    VendorListCreateView,
)

urlpatterns = [
    path("vendors/", VendorListCreateView.as_view(), name="vendor-list-create"),
    path("vendors/<uuid:item_id>/", VendorDetailView.as_view(), name="vendor-detail"),
    path("sent-items/", SentItemListCreateView.as_view(), name="sent-item-list-create"),
    path("sent-items/sources/", SentItemSourcesView.as_view(), name="sent-item-sources"),
    path("sent-items/<uuid:item_id>/", SentItemDetailView.as_view(), name="sent-item-detail"),
    path("po-documents/", PODocumentListCreateView.as_view(), name="po-document-list-create"),
    path("po-documents/<uuid:item_id>/", PODocumentDetailView.as_view(), name="po-document-detail"),
    path(
        "po-documents/<uuid:item_id>/history/",
        PODocumentHistoryView.as_view(),
        name="po-document-history",
    ),
    path(
        "request-to-quote-documents/",
        RequestToQuoteListCreateView.as_view(),
        name="request-to-quote-list-create",
    ),
    path(
        "request-to-quote-documents/<uuid:item_id>/",
        RequestToQuoteDetailView.as_view(),
        name="request-to-quote-detail",
    ),
    path(
        "request-to-quote-documents/<uuid:item_id>/history/",
        RequestToQuoteHistoryView.as_view(),
        name="request-to-quote-history",
    ),
    path(
        "request-to-quote-documents/<uuid:item_id>/approve/",
        RequestToQuoteApproveView.as_view(),
        name="request-to-quote-approve",
    ),
]
