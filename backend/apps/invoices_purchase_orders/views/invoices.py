from rest_framework import status as http_status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.invoices_purchase_orders.serializers.invoices import InvoiceSerializer
from apps.invoices_purchase_orders.services.invoices import InvoiceService


class InvoiceListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        filters = {}
        po_number = request.query_params.get("poNumber")
        if po_number:
            filters["po_number"] = po_number
        return Response({"data": InvoiceService.list(filters=filters)})

    def post(self, request):
        serializer = InvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = InvoiceService.create(serializer.validated_data, request.FILES.get("file"))
        return Response({"data": data}, status=http_status.HTTP_201_CREATED)


class InvoiceDetailView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, item_id):
        return Response({"data": InvoiceService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = InvoiceSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = InvoiceService.update(str(item_id), serializer.validated_data, request.FILES.get("file"))
        return Response({"data": data})

    patch = put

    def delete(self, request, item_id):
        InvoiceService.delete(str(item_id))
        return Response({"data": {"success": True}})


__all__ = ["InvoiceListCreateView", "InvoiceDetailView"]
