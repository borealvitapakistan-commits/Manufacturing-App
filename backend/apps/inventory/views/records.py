from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.services.records import InventoryRecordService


class InventoryRecordListView(APIView):
    def get(self, request, record_type: str):
        rows = InventoryRecordService.list(
            record_type,
            limit=request.query_params.get("limit", 200),
        )
        return Response({"data": rows})


__all__ = ["InventoryRecordListView"]
