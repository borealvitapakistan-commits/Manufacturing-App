from django.urls import path

from .views import (
    ProductDetailView,
    ProductFormulaView,
    ProductListCreateView,
    ProductsByRawMaterialView,
)


urlpatterns = [
    path("", ProductListCreateView.as_view(), name="product-list-create"),
    path(
        "by-raw-material/<uuid:raw_material_id>/",
        ProductsByRawMaterialView.as_view(),
        name="products-by-raw-material",
    ),
    path("<uuid:item_id>/", ProductDetailView.as_view(), name="product-detail"),
    path("<uuid:item_id>/formula/", ProductFormulaView.as_view(), name="product-formula"),
]
