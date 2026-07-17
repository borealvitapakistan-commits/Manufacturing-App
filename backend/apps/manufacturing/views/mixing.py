from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.manufacturing.serializers.mixing import StandaloneMixingSerializer
from apps.manufacturing.services import MixingService


def safe_limit(value, default=500, max_limit=2000):
    try:
        limit = int(value or default)
    except (TypeError, ValueError):
        return default
    return max(1, min(limit, max_limit))


class MixingListCreateView(APIView):
    def get(self, request):
        return Response(
            {
                "data": MixingService.list(
                    brand_id=request.query_params.get("brandId") or None,
                    product_id=request.query_params.get("productId") or None,
                    mixing_code=request.query_params.get("mixingCode") or None,
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
        serializer = StandaloneMixingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = MixingService.create(serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class MixingDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": MixingService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = StandaloneMixingSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response({"data": MixingService.update(str(item_id), serializer.validated_data)})

    patch = put

    def delete(self, request, item_id):
        return Response({"data": MixingService.delete(str(item_id))})
