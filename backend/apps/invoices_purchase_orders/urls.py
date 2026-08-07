from django.urls import path

from .views import (
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
]
