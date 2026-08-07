"""
URL configuration for the config project.

Main API URL structure:

    /api/commercial/
    /api/inventory/
    /api/manufacturing/
    /api/reports/

Manufacturing endpoints are managed inside:

    apps/manufacturing/urls.py
"""

from django.urls import include, path

from apps.commercial.views import (
    BrandDetailView,
    BrandListCreateView,
    CurrencyRateView,
    ProductDetailView,
    ProductFormulaView,
    ProductListCreateView,
    ProductPricingView,
    ProductsByRawMaterialView,
)
from apps.inventory.views import (
    AdjustStockView,
    BottleLidDetailView,
    BottleLidListCreateView,
    FinishedGoodsDetailView,
    FinishedGoodsListCreateView,
    InventoryHistoryView,
    LabelDetailView,
    LabelListCreateView,
    LabelValidationView,
    LowStockView,
    ManualAdjustmentView,
    RawMaterialByCodeView,
    RawMaterialCategoryDetailView,
    RawMaterialCategoryListCreateView,
    RawMaterialDetailView,
    RawMaterialListCreateView,
    SetStockView,
)
from apps.invoices_purchase_orders.views import (
    SentItemDetailView,
    SentItemListCreateView,
    SentItemSourcesView,
    VendorDetailView,
    VendorListCreateView,
)


urlpatterns = [
    # -------------------------------------------------------------------------
    # API aliases and common endpoints
    # -------------------------------------------------------------------------
    path(
        "api/",
        include("config.api_aliases"),
    ),
    path(
        "api/",
        include("apps.common.urls"),
    ),

    # -------------------------------------------------------------------------
    # Modular application routes
    # -------------------------------------------------------------------------
    path(
        "api/commercial/",
        include("apps.commercial.urls"),
    ),
    path(
        "api/inventory/",
        include("apps.inventory.urls"),
    ),
    path(
        "api/manufacturing/",
        include("apps.manufacturing.urls"),
    ),
    path(
        "api/reports/",
        include("apps.reports.urls"),
    ),
    path(
        "api/invoices-purchase-orders/",
        include("apps.invoices_purchase_orders.urls"),
    ),

    # -------------------------------------------------------------------------
    # Brand endpoints
    # -------------------------------------------------------------------------
    path(
        "api/brands/",
        BrandListCreateView.as_view(),
        name="brand-list-create",
    ),
    path(
        "api/brands/<uuid:item_id>/",
        BrandDetailView.as_view(),
        name="brand-detail",
    ),

    # -------------------------------------------------------------------------
    # Raw material endpoints
    # -------------------------------------------------------------------------
    path(
        "api/raw-materials/",
        RawMaterialListCreateView.as_view(),
        name="raw-material-list-create",
    ),
    path(
        "api/raw-materials/categories/",
        RawMaterialCategoryListCreateView.as_view(),
        name="raw-material-category-list-create",
    ),
    path(
        "api/raw-materials/categories/<uuid:item_id>/",
        RawMaterialCategoryDetailView.as_view(),
        name="raw-material-category-detail",
    ),
    path(
        "api/raw-material-categories/",
        RawMaterialCategoryListCreateView.as_view(),
        name="raw-material-categories-list-create",
    ),
    path(
        "api/raw-material-categories/<uuid:item_id>/",
        RawMaterialCategoryDetailView.as_view(),
        name="raw-material-categories-detail",
    ),
    path(
        "api/raw-materials/low-stock/",
        LowStockView.as_view(),
        name="raw-material-low-stock",
    ),
    path(
        "api/raw-materials/adjust-stock/",
        AdjustStockView.as_view(),
        name="raw-material-adjust-stock",
    ),
    path(
        "api/raw-materials/set-stock/",
        SetStockView.as_view(),
        name="raw-material-set-stock",
    ),
    path(
        "api/raw-materials/by-code/<str:code>/",
        RawMaterialByCodeView.as_view(),
        name="raw-material-by-code",
    ),
    path(
        "api/raw-materials/<uuid:item_id>/",
        RawMaterialDetailView.as_view(),
        name="raw-material-detail",
    ),

    # -------------------------------------------------------------------------
    # Product endpoints
    # -------------------------------------------------------------------------
    path(
        "api/products/",
        ProductListCreateView.as_view(),
        name="product-list-create",
    ),
    path(
        "api/products/by-raw-material/<uuid:raw_material_id>/",
        ProductsByRawMaterialView.as_view(),
        name="products-by-raw-material",
    ),
    path(
        "api/products/<uuid:item_id>/",
        ProductDetailView.as_view(),
        name="product-detail",
    ),
    path(
        "api/products/<uuid:item_id>/formula/",
        ProductFormulaView.as_view(),
        name="product-formula",
    ),

    # -------------------------------------------------------------------------
    # Label endpoints
    # -------------------------------------------------------------------------
    path(
        "api/labels/",
        LabelListCreateView.as_view(),
        name="label-list-create",
    ),
    path(
        "api/labels/validate/",
        LabelValidationView.as_view(),
        name="label-validation",
    ),
    path(
        "api/labels/<uuid:item_id>/",
        LabelDetailView.as_view(),
        name="label-detail",
    ),

    # -------------------------------------------------------------------------
    # Bottles and lids endpoints
    # -------------------------------------------------------------------------
    path(
        "api/bottles-lids/",
        BottleLidListCreateView.as_view(),
        name="bottle-lid-list-create",
    ),
    path(
        "api/bottles-lids/<uuid:item_id>/",
        BottleLidDetailView.as_view(),
        name="bottle-lid-detail",
    ),

    # -------------------------------------------------------------------------
    # Finished goods endpoints
    # -------------------------------------------------------------------------
    path(
        "api/finished-goods/",
        FinishedGoodsListCreateView.as_view(),
        name="finished-goods-list-create",
    ),
    path(
        "api/finished-goods/history/",
        InventoryHistoryView.as_view(),
        name="finished-goods-history",
    ),
    path(
        "api/finished-goods/manual-adjustment/",
        ManualAdjustmentView.as_view(),
        name="finished-goods-manual-adjustment",
    ),
    path(
        "api/finished-goods/<uuid:item_id>/",
        FinishedGoodsDetailView.as_view(),
        name="finished-goods-detail",
    ),

    # -------------------------------------------------------------------------
    # Product pricing endpoints
    # -------------------------------------------------------------------------
    path(
        "api/product-price-calculator/<uuid:product_id>/",
        ProductPricingView.as_view(),
        name="product-price-calculator",
    ),
    path(
        "api/currency-rate/",
        CurrencyRateView.as_view(),
        name="currency-rate",
    ),

    # -------------------------------------------------------------------------
    # Vendor endpoints
    # -------------------------------------------------------------------------
    path(
        "api/vendors/",
        VendorListCreateView.as_view(),
        name="vendor-list-create",
    ),
    path(
        "api/vendors/<uuid:item_id>/",
        VendorDetailView.as_view(),
        name="vendor-detail",
    ),

    # -------------------------------------------------------------------------
    # Send Items (vendor shipments) endpoints
    # -------------------------------------------------------------------------
    path(
        "api/sent-items/",
        SentItemListCreateView.as_view(),
        name="sent-item-list-create",
    ),
    path(
        "api/sent-items/sources/",
        SentItemSourcesView.as_view(),
        name="sent-item-sources",
    ),
    path(
        "api/sent-items/<uuid:item_id>/",
        SentItemDetailView.as_view(),
        name="sent-item-detail",
    ),
]