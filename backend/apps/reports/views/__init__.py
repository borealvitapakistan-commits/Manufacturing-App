from .assembly import AssemblyReportDetailView, AssemblyReportListView
from .encapsulation import (
    EncapsulationReportDetailView,
    EncapsulationReportListView,
    NJPReportDetailView,
    NJPReportListView,
)
from .mixing import MixingReportDetailView, MixingReportListView

__all__ = [
    "AssemblyReportDetailView",
    "AssemblyReportListView",
    "EncapsulationReportDetailView",
    "EncapsulationReportListView",
    "MixingReportDetailView",
    "MixingReportListView",
    "NJPReportDetailView",
    "NJPReportListView",
]
