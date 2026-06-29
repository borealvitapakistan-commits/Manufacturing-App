from django.urls import path

from .views import BrandDetailView, BrandListCreateView


urlpatterns = [
    path("", BrandListCreateView.as_view(), name="brand-list-create"),
    path("<uuid:item_id>/", BrandDetailView.as_view(), name="brand-detail"),
]
