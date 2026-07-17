from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView
from apps.common.serializers import ManualInventoryAdjustmentSerializer
from apps.inventory.services.finished_goods import (
    FinishedGoodsHistoryService,
    FinishedGoodsService,
)

from apps.inventory.serializers.finished_goods import (
    FinishedGoodsSerializer,
    FinishedGoodsUpdateSerializer,
)


class FinishedGoodsListCreateView(TableListCreateView):
    service_class = FinishedGoodsService
    serializer_class = FinishedGoodsSerializer
    filter_map = {
        "brandId": "brand_id",
        "productId": "product_id",
        "category": "category",
    }
    search_column = "name"


class FinishedGoodsDetailView(TableDetailView):
    service_class = FinishedGoodsService
    serializer_class = FinishedGoodsUpdateSerializer

    def put(self, request, item_id):
        serializer = self.serializer_class(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        reason = values.pop("reason", "")
        data = FinishedGoodsService.update_with_history(
            str(item_id),
            values,
            reason=reason,
        )
        return Response({"data": data})

    patch = put


class InventoryHistoryView(APIView):
    def get(self, request):
        filters = {}
        if request.query_params.get("finishedGoodId"):
            filters["finished_good_id"] = request.query_params["finishedGoodId"]
        data = FinishedGoodsHistoryService.list(filters=filters, limit=200)
        return Response({"data": data})


class ManualAdjustmentView(APIView):
    def post(self, request):
        serializer = ManualInventoryAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        data = FinishedGoodsService.update_with_history(
            str(values["finishedGoodId"]),
            values["changes"],
            reason=values.get("reason") or "",
        )
        return Response({"data": data})
