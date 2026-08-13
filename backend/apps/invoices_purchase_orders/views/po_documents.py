from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

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


class PODocumentHistoryView(APIView):
    def get(self, request, item_id):
        return Response({"data": PODocumentService.history(str(item_id))})


class PODocumentPaymentProofView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, item_id):
        data = PODocumentService.set_payment_proof(str(item_id), request.FILES.get("file"))
        return Response({"data": data})


__all__ = [
    "PODocumentListCreateView",
    "PODocumentDetailView",
    "PODocumentHistoryView",
    "PODocumentPaymentProofView",
]
