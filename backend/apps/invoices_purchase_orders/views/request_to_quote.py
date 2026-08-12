from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView

from apps.invoices_purchase_orders.serializers.request_to_quote import RequestToQuoteSerializer
from apps.invoices_purchase_orders.services.request_to_quote import RequestToQuoteService


class RequestToQuoteListCreateView(TableListCreateView):
    service_class = RequestToQuoteService
    serializer_class = RequestToQuoteSerializer

    def get_filters(self, request):
        filters = {}
        vendor_id = request.query_params.get("vendorId")
        if vendor_id:
            filters["vendor_id"] = vendor_id
        status = request.query_params.get("status")
        if status:
            filters["status"] = status
        return filters


class RequestToQuoteDetailView(TableDetailView):
    service_class = RequestToQuoteService
    serializer_class = RequestToQuoteSerializer


class RequestToQuoteHistoryView(APIView):
    def get(self, request, item_id):
        return Response({"data": RequestToQuoteService.history(str(item_id))})


class RequestToQuoteApproveView(APIView):
    def post(self, request, item_id):
        return Response(
            {"data": RequestToQuoteService.approve(str(item_id))},
            status=http_status.HTTP_201_CREATED,
        )


__all__ = [
    "RequestToQuoteListCreateView",
    "RequestToQuoteDetailView",
    "RequestToQuoteHistoryView",
    "RequestToQuoteApproveView",
]
