from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView
from apps.common.serializers import StockAdjustmentSerializer, StockLevelSerializer
from apps.inventory.serializers.raw_materials import (
    RawMaterialCategorySerializer,
    RawMaterialSerializer,
)
from apps.inventory.services.raw_materials import (
    RawMaterialCategoryService,
    RawMaterialService,
)


class RawMaterialListCreateView(TableListCreateView):
    service_class = RawMaterialService
    serializer_class = RawMaterialSerializer
    search_column = "name"
    filter_map = {
        "categoryId": "category_id",
        "category_id": "category_id",
    }

    def get(self, request):
        if request.query_params.get("lowStock") is not None:
            threshold = float(request.query_params.get("lowStock") or 10)
            return Response({"data": RawMaterialService.low_stock(threshold)})
        if request.query_params.get("search"):
            return Response(
                {
                    "data": RawMaterialService.search(
                        request.query_params["search"],
                        int(request.query_params.get("limit", 100)),
                    )
                }
            )
        return super().get(request)


class RawMaterialDetailView(TableDetailView):
    service_class = RawMaterialService
    serializer_class = RawMaterialSerializer


class RawMaterialCategoryListCreateView(TableListCreateView):
    service_class = RawMaterialCategoryService
    serializer_class = RawMaterialCategorySerializer
    search_column = "name"
    filter_map = {
        "active": "is_active",
        "activeOnly": "is_active",
        "isNmiCategory": "is_nmi_category",
        "is_nmi_category": "is_nmi_category",
        "nmiOnly": "is_nmi_category",
    }

    def get_filters(self, request):
        filters = super().get_filters(request)
        for query_name, db_name in (
            ("active", "is_active"),
            ("activeOnly", "is_active"),
            ("isNmiCategory", "is_nmi_category"),
            ("is_nmi_category", "is_nmi_category"),
            ("nmiOnly", "is_nmi_category"),
        ):
            value = request.query_params.get(query_name)
            if value is None:
                continue
            normalized = value.lower()
            if normalized in {"true", "1", "yes"}:
                filters[db_name] = True
            elif normalized in {"false", "0", "no"}:
                filters[db_name] = False
        return filters


class RawMaterialCategoryDetailView(TableDetailView):
    service_class = RawMaterialCategoryService
    serializer_class = RawMaterialCategorySerializer


class LowStockView(APIView):
    def get(self, request):
        threshold = float(request.query_params.get("threshold", 10))
        return Response({"data": RawMaterialService.low_stock(threshold)})


class AdjustStockView(APIView):
    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = RawMaterialService.adjust_stock(
            str(serializer.validated_data["id"]),
            float(serializer.validated_data["adjustment"]),
        )
        return Response({"data": data})


class SetStockView(APIView):
    def post(self, request):
        serializer = StockLevelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = RawMaterialService.update_stock(
            str(serializer.validated_data["id"]),
            float(serializer.validated_data["quantity"]),
        )
        return Response({"data": data})


class RawMaterialByCodeView(APIView):
    def get(self, request, code):
        return Response({"data": RawMaterialService.get_by_code(code)})
