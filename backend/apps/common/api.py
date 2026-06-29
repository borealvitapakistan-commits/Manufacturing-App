from typing import Any

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import OpenPayloadSerializer


class TableListCreateView(APIView):
    service_class = None
    serializer_class = OpenPayloadSerializer
    filter_map: dict[str, str] = {}
    search_column: str | None = None
    order_by = "created_at"

    def get_filters(self, request) -> dict[str, Any]:
        return {
            db_name: request.query_params.get(api_name)
            for api_name, db_name in self.filter_map.items()
            if request.query_params.get(api_name) not in {None, ""}
        }

    def prepare_create_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        return payload

    def get(self, request):
        limit = int(request.query_params.get("limit", 100))
        search_value = request.query_params.get("search", "")
        search = (self.search_column, search_value) if self.search_column else None
        data = self.service_class.list(
            filters=self.get_filters(request),
            search=search,
            order_by=self.order_by,
            limit=limit,
        )
        return Response({"data": data})

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = self.service_class.create(self.prepare_create_payload(serializer.validated_data))
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class TableDetailView(APIView):
    service_class = None
    serializer_class = OpenPayloadSerializer

    def get(self, request, item_id):
        return Response({"data": self.service_class.get(str(item_id))})

    def put(self, request, item_id):
        serializer = self.serializer_class(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = self.service_class.update(str(item_id), serializer.validated_data)
        return Response({"data": data})

    patch = put

    def delete(self, request, item_id):
        self.service_class.delete(str(item_id))
        return Response({"data": {"success": True}})
