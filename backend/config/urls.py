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

from apps.batches.views import StandaloneMixingDetailView, StandaloneMixingListCreateView

urlpatterns = [
    path("api/", include("config.api_aliases")),
    path("api/", include("apps.common.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/brands/", include("apps.brands.urls")),
    path("api/raw-materials/", include("apps.raw_materials.urls")),
    path("api/products/", include("apps.products.urls")),
    path("api/labels/", include("apps.labels.urls")),
    path("api/mixing/", StandaloneMixingListCreateView.as_view()),
    path("api/mixing/<uuid:item_id>/", StandaloneMixingDetailView.as_view()),
    path("api/batches/", include("apps.batches.urls")),
    path("api/inventory/", include("apps.inventory.urls")),
    path("api/finished-goods/", include("apps.inventory.urls")),
    path("api/procurement/", include("apps.procurement.urls")),
    path("api/", include("apps.procurement.urls")),
    path("api/hr/", include("apps.hr.urls")),
    path("api/", include("apps.hr.urls")),
    path("api/finance/", include("apps.finance.urls")),
    path("api/", include("apps.finance.urls")),
    path("api/reports/", include("apps.reports.urls")),
]
