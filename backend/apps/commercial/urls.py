from django.urls import path

from .views import (
    BrandDetailView,
    BrandListCreateView,
    CurrencyRateView,
    ProductDetailView,
    ProductFormulaView,
    ProductListCreateView,
    ProductPricingView,
    ProductsByRawMaterialView,
)


urlpatterns = [
    path("brands/", BrandListCreateView.as_view(), name="commercial-brand-list-create"),
    path("brands/<uuid:item_id>/", BrandDetailView.as_view(), name="commercial-brand-detail"),
    path("products/", ProductListCreateView.as_view(), name="commercial-product-list-create"),
    path(
        "products/by-raw-material/<uuid:raw_material_id>/",
        ProductsByRawMaterialView.as_view(),
        name="commercial-products-by-raw-material",
    ),
    path("products/<uuid:item_id>/", ProductDetailView.as_view(), name="commercial-product-detail"),
    path(
        "products/<uuid:item_id>/formula/",
        ProductFormulaView.as_view(),
        name="commercial-product-formula",
    ),
    path(
        "product-price-calculator/<uuid:product_id>/",
        ProductPricingView.as_view(),
        name="commercial-product-price-calculate",
    ),
    path("currency-rate/", CurrencyRateView.as_view(), name="commercial-currency-rate"),
]
