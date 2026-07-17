from apps.manufacturing.services import AssemblyService, MixingService, NJPService

from .assembly import AssemblyDetailView, AssemblyListCreateView
from .mixing import MixingDetailView, MixingListCreateView
from .njp import NJPDetailView, NJPListCreateView

__all__ = [
    "AssemblyDetailView",
    "AssemblyListCreateView",
    "AssemblyService",
    "MixingService",
    "NJPService",
    "MixingDetailView",
    "MixingListCreateView",
    "NJPDetailView",
    "NJPListCreateView",
]
