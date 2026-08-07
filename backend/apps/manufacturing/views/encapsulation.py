from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.manufacturing.serializers.encapsulation import EncapsulationSerializer
from apps.manufacturing.services import EncapsulationService
from apps.manufacturing.views.mixing import safe_limit


class EncapsulationListCreateView(APIView):
    def get(self, request):
        return Response(
            {
                "data": EncapsulationService.list(
                    brand_id=request.query_params.get("brandId") or None,
                    product_id=request.query_params.get("productId") or None,
                    mixing_id=request.query_params.get("mixingId") or None,
                    search=(
                        request.query_params.get("search")
                        or request.query_params.get("q")
                        or None
                    ),
                    limit=safe_limit(request.query_params.get("limit")),
                )
            }
        )

    def post(self, request):
        serializer = EncapsulationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = EncapsulationService.create(serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class EncapsulationDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": EncapsulationService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = EncapsulationSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response({"data": EncapsulationService.update(str(item_id), serializer.validated_data)})

    patch = put

    def delete(self, request, item_id):
        return Response({"data": EncapsulationService.delete(str(item_id))})


NJPListCreateView = EncapsulationListCreateView
NJPDetailView = EncapsulationDetailView

__all__ = [
    "EncapsulationListCreateView",
    "EncapsulationDetailView",
    "NJPListCreateView",
    "NJPDetailView",
]
