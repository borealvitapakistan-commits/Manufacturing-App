from django.urls import path

from .views import (
    AssemblyDetailView,
    AssemblyListCreateView,
    EncapsulationDetailView,
    EncapsulationListCreateView,
    MixingDetailView,
    MixingListCreateView,
)

urlpatterns = [
    path(
        "mixing/",
        MixingListCreateView.as_view(),
        name="mixing-list-create",
    ),
    path(
        "mixing/<str:item_id>/",
        MixingDetailView.as_view(),
        name="mixing-detail",
    ),

    path(
        "encapsulation/",
        EncapsulationListCreateView.as_view(),
        name="encapsulation-list-create",
    ),
    path(
        "encapsulation/<str:item_id>/",
        EncapsulationDetailView.as_view(),
        name="encapsulation-detail",
    ),

    path(
        "assembly/",
        AssemblyListCreateView.as_view(),
        name="assembly-list-create",
    ),
    path(
        "assembly/<str:item_id>/",
        AssemblyDetailView.as_view(),
        name="assembly-detail",
    ),
]