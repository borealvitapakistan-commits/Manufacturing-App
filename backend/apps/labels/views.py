from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView
from services.catalog_service import LabelService

from .serializers import LabelSerializer, LabelValidationSerializer


class LabelListCreateView(TableListCreateView):
    service_class = LabelService
    serializer_class = LabelSerializer
    filter_map = {
        "brandId": "brand_id",
        "productId": "product_id",
        "active": "is_active",
        "activeOnly": "is_active",
    }

    def get_filters(self, request):
        filters = super().get_filters(request)
        if request.query_params.get("activeOnly", "").lower() == "true":
            filters["is_active"] = True
        return filters


class LabelDetailView(TableDetailView):
    service_class = LabelService
    serializer_class = LabelSerializer


class LabelValidationView(APIView):
    def get(self, request):
        serializer = LabelValidationSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        data = LabelService.validate(
            str(values["brandId"]),
            str(values["productId"]),
            values["required"],
        )
        return Response({"data": data})
