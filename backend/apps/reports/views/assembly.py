from rest_framework.response import Response
from rest_framework.views import APIView

from apps.reports.selectors.assembly import get_assembly_report, list_assembly_reports
from apps.reports.serializers.assembly import AssemblyReportQuerySerializer


class AssemblyReportListView(APIView):
    def get(self, request):
        serializer = AssemblyReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        return Response(
            {
                "data": list_assembly_reports(
                    brand_id=values.get("brandId") or None,
                    product_id=values.get("productId") or None,
                    njp_id=values.get("encapsulationId") or values.get("njpId") or None,
                    search=values.get("search") or None,
                    from_date=values.get("fromDate"),
                    to_date=values.get("toDate"),
                    limit=values.get("limit", 500),
                )
            }
        )


class AssemblyReportDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": get_assembly_report(str(item_id))})
