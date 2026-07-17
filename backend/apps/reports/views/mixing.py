from rest_framework.response import Response
from rest_framework.views import APIView

from apps.reports.selectors.mixing import get_mixing_report, list_mixing_reports
from apps.reports.serializers.mixing import MixingReportQuerySerializer


class MixingReportListView(APIView):
    def get(self, request):
        serializer = MixingReportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        return Response(
            {
                "data": list_mixing_reports(
                    brand_id=values.get("brandId") or None,
                    product_id=values.get("productId") or None,
                    search=values.get("search") or None,
                    from_date=values.get("fromDate"),
                    to_date=values.get("toDate"),
                    limit=values.get("limit", 500),
                )
            }
        )


class MixingReportDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": get_mixing_report(str(item_id))})
