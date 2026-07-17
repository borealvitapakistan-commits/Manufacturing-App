"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
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
from apps.manufacturing.views import (
    AssemblyDetailView,
    AssemblyListCreateView,
    MixingDetailView,
    MixingListCreateView,
    NJPDetailView,
    NJPListCreateView,
)

urlpatterns = [
    path("api/", include("config.api_aliases")),
    path("api/", include("apps.common.urls")),
    path("api/commercial/", include("apps.commercial.urls")),
    path("api/brands/", BrandListCreateView.as_view()),
    path("api/brands/<uuid:item_id>/", BrandDetailView.as_view()),
    path("api/raw-materials/", RawMaterialListCreateView.as_view()),
    path("api/raw-materials/categories/", RawMaterialCategoryListCreateView.as_view()),
    path("api/raw-materials/categories/<uuid:item_id>/", RawMaterialCategoryDetailView.as_view()),
    path("api/raw-materials/low-stock/", LowStockView.as_view()),
    path("api/raw-materials/adjust-stock/", AdjustStockView.as_view()),
    path("api/raw-materials/set-stock/", SetStockView.as_view()),
    path("api/raw-materials/by-code/<str:code>/", RawMaterialByCodeView.as_view()),
    path("api/raw-materials/<uuid:item_id>/", RawMaterialDetailView.as_view()),
    path("api/products/", ProductListCreateView.as_view()),
    path("api/products/by-raw-material/<uuid:raw_material_id>/", ProductsByRawMaterialView.as_view()),
    path("api/products/<uuid:item_id>/", ProductDetailView.as_view()),
    path("api/products/<uuid:item_id>/formula/", ProductFormulaView.as_view()),
    path("api/labels/", LabelListCreateView.as_view()),
    path("api/labels/validate/", LabelValidationView.as_view()),
    path("api/labels/<uuid:item_id>/", LabelDetailView.as_view()),
    path("api/bottles-lids/", BottleLidListCreateView.as_view()),
    path("api/bottles-lids/<uuid:item_id>/", BottleLidDetailView.as_view()),
    path("api/mixing/", MixingListCreateView.as_view()),
    path("api/mixing/<str:item_id>/", MixingDetailView.as_view()),
    path("api/njp/", NJPListCreateView.as_view()),
    path("api/njp/<str:item_id>/", NJPDetailView.as_view()),
    path("api/assembly/", AssemblyListCreateView.as_view()),
    path("api/assembly/<str:item_id>/", AssemblyDetailView.as_view()),
    path("api/manufacturing/", include("apps.manufacturing.urls")),
    path("api/inventory/", include("apps.inventory.urls")),
    path("api/finished-goods/", FinishedGoodsListCreateView.as_view()),
    path("api/finished-goods/history/", InventoryHistoryView.as_view()),
    path("api/finished-goods/manual-adjustment/", ManualAdjustmentView.as_view()),
    path("api/finished-goods/<uuid:item_id>/", FinishedGoodsDetailView.as_view()),
    path("api/product-price-calculator/<uuid:product_id>/", ProductPricingView.as_view()),
    path("api/currency-rate/", CurrencyRateView.as_view()),
    path("api/reports/", include("apps.reports.urls")),
]
