from apps.common.api import TableDetailView, TableListCreateView

from apps.invoices_purchase_orders.serializers.vendors import VendorSerializer
from apps.invoices_purchase_orders.services.vendors import VendorService


class VendorListCreateView(TableListCreateView):
    service_class = VendorService
    serializer_class = VendorSerializer
    search_column = "name"

    def get_filters(self, request):
        filters = {}
        # fetchVendors() sends ?active=true (not activeOnly, unlike most other
        # list endpoints in this codebase) - matched here rather than changing
        # the already-working frontend call.
        active_param = request.query_params.get("active") or request.query_params.get("activeOnly")
        if (active_param or "").lower() == "true":
            filters["is_active"] = True
        return filters


class VendorDetailView(TableDetailView):
    service_class = VendorService
    serializer_class = VendorSerializer

__all__ = ["VendorListCreateView", "VendorDetailView"]
