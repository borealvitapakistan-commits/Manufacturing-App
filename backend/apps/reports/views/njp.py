from rest_framework.response import Response
from rest_framework.views import APIView

from apps.reports.selectors.njp import get_njp_report, list_njp_reports
from apps.reports.serializers.njp import NJPReportQuerySerializer


class NJPReportListView(APIView):
    def get(self, request):
        serializer = NJPReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        return Response(
            {
                "data": list_njp_reports(
                    brand_id=values.get("brandId") or None,
                    product_id=values.get("productId") or None,
                    mixing_id=values.get("mixingId") or None,
                    search=values.get("search") or None,
                    from_date=values.get("fromDate"),
                    to_date=values.get("toDate"),
                    limit=values.get("limit", 500),
                )
            }
        )


class NJPReportDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": get_njp_report(str(item_id))})
