from rest_framework import status as http_status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.invoices_purchase_orders.serializers.quotes import QuoteSerializer
from apps.invoices_purchase_orders.services.quotes import QuoteService


class QuoteListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        filters = {}
        rtq_number = request.query_params.get("rtqNumber")
        if rtq_number:
            filters["rtq_number"] = rtq_number
        return Response({"data": QuoteService.list(filters=filters)})

    def post(self, request):
        serializer = QuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = QuoteService.create(serializer.validated_data, request.FILES.get("file"))
        return Response({"data": data}, status=http_status.HTTP_201_CREATED)


class QuoteDetailView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, item_id):
        return Response({"data": QuoteService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = QuoteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = QuoteService.update(str(item_id), serializer.validated_data, request.FILES.get("file"))
        return Response({"data": data})

    patch = put

    def delete(self, request, item_id):
        QuoteService.delete(str(item_id))
        return Response({"data": {"success": True}})


__all__ = ["QuoteListCreateView", "QuoteDetailView"]
