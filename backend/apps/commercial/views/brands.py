from apps.common.api import TableDetailView, TableListCreateView

from apps.commercial.serializers.brands import BrandSerializer
from apps.commercial.services.brands import BrandService


class BrandListCreateView(TableListCreateView):
    service_class = BrandService
    serializer_class = BrandSerializer
    filter_map = {"activeOnly": "is_active"}
    search_column = "name"

    def get_filters(self, request):
        filters = {}
        if request.query_params.get("activeOnly", "").lower() == "true":
            filters["is_active"] = True
        return filters


class BrandDetailView(TableDetailView):
    service_class = BrandService
    serializer_class = BrandSerializer
