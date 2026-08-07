from apps.manufacturing.services import (
    AssemblyService,
    EncapsulationService,
    MixingService,
    NJPService,
)

from .assembly import AssemblyDetailView, AssemblyListCreateView
from .encapsulation import (
    EncapsulationDetailView,
    EncapsulationListCreateView,
    NJPDetailView,
    NJPListCreateView,
)
from .mixing import MixingDetailView, MixingListCreateView

__all__ = [
    "AssemblyDetailView",
    "AssemblyListCreateView",
    "AssemblyService",
    "EncapsulationDetailView",
    "EncapsulationListCreateView",
    "EncapsulationService",
    "MixingService",
    "NJPService",
    "MixingDetailView",
    "MixingListCreateView",
    "NJPDetailView",
    "NJPListCreateView",
]
