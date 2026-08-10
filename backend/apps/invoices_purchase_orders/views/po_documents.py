from apps.common.api import TableDetailView, TableListCreateView

from apps.invoices_purchase_orders.serializers.po_documents import PODocumentSerializer
from apps.invoices_purchase_orders.services.po_documents import PODocumentService


class PODocumentListCreateView(TableListCreateView):
    service_class = PODocumentService
    serializer_class = PODocumentSerializer

    def get_filters(self, request):
        filters = {}
        vendor_id = request.query_params.get("vendorId")
        if vendor_id:
            filters["vendor_id"] = vendor_id
        status = request.query_params.get("status")
        if status:
            filters["status"] = status
        return filters


class PODocumentDetailView(TableDetailView):
    service_class = PODocumentService
    serializer_class = PODocumentSerializer


__all__ = ["PODocumentListCreateView", "PODocumentDetailView"]
