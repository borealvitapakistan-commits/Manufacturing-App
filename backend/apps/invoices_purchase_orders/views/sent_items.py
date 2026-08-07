from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.invoices_purchase_orders.serializers.sent_items import SentItemSerializer
from apps.invoices_purchase_orders.services.sent_items import SentItemService


def _safe_limit(value) -> int:
    try:
        return max(1, min(int(value), 2000))
    except (TypeError, ValueError):
        return 500


class SentItemListCreateView(APIView):
    def get(self, request):
        return Response(
            {
                "data": SentItemService.list(
                    vendor_id=request.query_params.get("vendorId") or None,
                    brand_id=request.query_params.get("brandId") or None,
                    item_type=request.query_params.get("itemType") or None,
                    search=request.query_params.get("search") or request.query_params.get("q") or None,
                    limit=_safe_limit(request.query_params.get("limit")),
                )
            }
        )

    def post(self, request):
        serializer = SentItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = SentItemService.create(serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class SentItemDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": SentItemService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = SentItemSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response({"data": SentItemService.update(str(item_id), serializer.validated_data)})

    patch = put

    def delete(self, request, item_id):
        return Response({"data": SentItemService.delete(str(item_id))})


class SentItemSourcesView(APIView):
    def get(self, request):
        item_type = request.query_params.get("itemType") or ""
        brand_id = request.query_params.get("brandId") or None
        return Response({"data": SentItemService.list_sources(item_type, brand_id)})

__all__ = ["SentItemListCreateView", "SentItemDetailView", "SentItemSourcesView"]
