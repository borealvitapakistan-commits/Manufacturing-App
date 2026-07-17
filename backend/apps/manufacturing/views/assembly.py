from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.manufacturing.serializers.assembly import AssemblySerializer
from apps.manufacturing.services import AssemblyService
from apps.manufacturing.views.mixing import safe_limit


class AssemblyListCreateView(APIView):
    def get(self, request):
        return Response(
            {
                "data": AssemblyService.list(
                    brand_id=request.query_params.get("brandId") or None,
                    product_id=request.query_params.get("productId") or None,
                    njp_id=request.query_params.get("njpId") or None,
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
        serializer = AssemblySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = AssemblyService.create(serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class AssemblyDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": AssemblyService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = AssemblySerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response({"data": AssemblyService.update(str(item_id), serializer.validated_data)})

    patch = put

    def delete(self, request, item_id):
        return Response({"data": AssemblyService.delete(str(item_id))})
