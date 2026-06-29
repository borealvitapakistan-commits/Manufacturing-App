from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework import status

from apps.common.api import TableDetailView, TableListCreateView
from services.procurement_service import (
    CompanySettingsService,
    PODocumentService,
    PurchaseOrderService,
    VendorService,
)

from .serializers import (
    CompanySettingsSerializer,
    PODocumentSerializer,
    PurchaseOrderSerializer,
    VendorSerializer,
)


class CompanySettingsView(APIView):
    def get(self, request):
        return Response({"data": CompanySettingsService.get_current()})

    def put(self, request):
        serializer = CompanySettingsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response({"data": CompanySettingsService.save(serializer.validated_data)})

    patch = put
    post = put


class VendorListCreateView(TableListCreateView):
    service_class = VendorService
    serializer_class = VendorSerializer
    filter_map = {"active": "is_active", "deleted": "deleted"}
    search_column = "name"


class VendorDetailView(TableDetailView):
    service_class = VendorService
    serializer_class = VendorSerializer


class PurchaseOrderListCreateView(TableListCreateView):
    service_class = PurchaseOrderService
    serializer_class = PurchaseOrderSerializer
    filter_map = {
        "vendorId": "vendor_id",
        "brandId": "brand_id",
        "status": "status",
        "orderType": "order_type",
        "rawMaterialId": "raw_material_id",
        "labelInventoryId": "label_inventory_id",
        "productId": "product_id",
    }


class PurchaseOrderDetailView(TableDetailView):
    service_class = PurchaseOrderService
    serializer_class = PurchaseOrderSerializer


class PostPurchaseOrderView(APIView):
    def post(self, request, item_id):
        return Response({"data": PurchaseOrderService.receive(str(item_id))})


class PODocumentListCreateView(APIView):
    def get(self, request):
        filters = {}
        if request.query_params.get("status"):
            filters["status"] = request.query_params["status"]
        data = PODocumentService.list(
            filters=filters,
            limit=int(request.query_params.get("limit", 200)),
        )
        return Response({"data": data})

    def post(self, request):
        serializer = PODocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = PODocumentService.save(serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class PODocumentDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": PODocumentService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = PODocumentSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(
            {"data": PODocumentService.save(serializer.validated_data, str(item_id))}
        )

    patch = put

    def delete(self, request, item_id):
        PODocumentService.delete(str(item_id))
        return Response({"data": {"success": True}})
