from django.urls import path

from .views import (
    AssemblyDetailView,
    AssemblyListCreateView,
    MixingDetailView,
    MixingListCreateView,
    NJPDetailView,
    NJPListCreateView,
)


urlpatterns = [
    path("mixing/", MixingListCreateView.as_view(), name="mixing-list-create"),
    path("mixing/<str:item_id>/", MixingDetailView.as_view(), name="mixing-detail"),
    path("njp/", NJPListCreateView.as_view(), name="njp-list-create"),
    path("njp/<str:item_id>/", NJPDetailView.as_view(), name="njp-detail"),
    path("assembly/", AssemblyListCreateView.as_view(), name="assembly-list-create"),
    path("assembly/<str:item_id>/", AssemblyDetailView.as_view(), name="assembly-detail"),
]
