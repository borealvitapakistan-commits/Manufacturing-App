from apps.common.api import TableDetailView, TableListCreateView
from services.catalog_service import BrandService

from .serializers import BrandSerializer


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
