from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView
from services.catalog_service import ProductService

from .serializers import ProductSerializer


class ProductListCreateView(TableListCreateView):
    service_class = ProductService
    serializer_class = ProductSerializer
    search_column = "name"


class ProductDetailView(TableDetailView):
    service_class = ProductService
    serializer_class = ProductSerializer


class ProductFormulaView(APIView):
    def get(self, request, item_id):
        product = ProductService.get(str(item_id))
        return Response({"data": product.get("rm", [])})


class ProductsByRawMaterialView(APIView):
    def get(self, request, raw_material_id):
        return Response(
            {
                "data": ProductService.get_by_raw_material(
                    str(raw_material_id)
                )
            }
        )
