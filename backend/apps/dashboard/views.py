from rest_framework.response import Response
from rest_framework.views import APIView

from services.batch_service import BatchService
from services.catalog_service import BrandService, ProductService, RawMaterialService


class DashboardStatsView(APIView):
    def get(self, request):
        return Response(
            {
                "data": {
                    "brands": BrandService.count({"is_active": True}),
                    "products": ProductService.count(),
                    "rawMaterials": RawMaterialService.count(),
                    "activeBatches": sum(
                        BatchService.count({"status": status})
                        for status in ("mixingPending", "ngpPending", "assemblyPending")
                    ),
                    "finalizedBatches": BatchService.count({"status": "finalized"}),
                }
            }
        )


class LowStockView(APIView):
    def get(self, request):
        threshold = float(request.query_params.get("threshold", 10))
        return Response({"data": RawMaterialService.low_stock(threshold)})


class RecentBatchesView(APIView):
    def get(self, request):
        return Response({"data": BatchService.list(limit=int(request.query_params.get("limit", 10)))})


class PendingWorkView(APIView):
    def get(self, request):
        data = {
            status: BatchService.list(filters={"status": status}, limit=100)
            for status in ("mixingPending", "ngpPending", "assemblyPending")
        }
        return Response({"data": data})
