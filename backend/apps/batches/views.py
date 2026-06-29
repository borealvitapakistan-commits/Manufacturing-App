from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableListCreateView
from apps.common.serializers import OpenPayloadSerializer
from services.base_service import ServiceError
from services.batch_service import (
    AssemblyService,
    BatchService,
    MixingService,
    NJPService,
    StageLifecycleService,
)

from .serializers import (
    AssemblySerializer,
    BatchSerializer,
    MixingSerializer,
    NJPSerializer,
    StageLifecycleSerializer,
)


class BatchListCreateView(TableListCreateView):
    service_class = BatchService
    serializer_class = BatchSerializer
    filter_map = {"brandId": "brand_id", "status": "status"}


class BatchDetailView(APIView):
    def get(self, request, item_id):
        return Response({"data": BatchService.get(str(item_id))})

    def put(self, request, item_id):
        serializer = BatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response({"data": BatchService.update(str(item_id), serializer.validated_data)})

    patch = put

    def delete(self, request, item_id):
        cascade = request.query_params.get("cascade", "").lower() == "true"
        return Response(
            {"data": BatchService.delete_safely(str(item_id), cascade=cascade)}
        )


class ValidateStockView(APIView):
    def get(self, request, item_id):
        return Response({"data": BatchService.validate_stock(str(item_id))})


class ValidateLabelsView(APIView):
    def get(self, request, item_id):
        return Response({"data": BatchService.validate_labels(str(item_id))})


class MixingView(APIView):
    def get(self, request, item_id):
        return Response({"data": MixingService.get_by_batch(str(item_id))})

    def post(self, request, item_id):
        serializer = MixingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = MixingService.create_for_batch(str(item_id), serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)

    def put(self, request, item_id):
        serializer = MixingSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(
            {
                "data": MixingService.update_for_batch(
                    str(item_id),
                    serializer.validated_data,
                )
            }
        )

    patch = put

    def delete(self, request, item_id):
        return Response({"data": MixingService.delete_by_batch(str(item_id))})


class StageView(APIView):
    service_class = None
    serializer_class = OpenPayloadSerializer

    def get(self, request, item_id):
        return Response({"data": self.service_class.get_by_batch(str(item_id))})

    def post(self, request, item_id):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = self.service_class.create_for_batch(str(item_id), serializer.validated_data)
        return Response({"data": data}, status=status.HTTP_201_CREATED)

    def put(self, request, item_id):
        serializer = self.serializer_class(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        update_for_batch = getattr(self.service_class, "update_for_batch", None)
        if update_for_batch:
            data = update_for_batch(str(item_id), serializer.validated_data)
        else:
            report = self.service_class.get_by_batch(str(item_id))
            data = self.service_class.update(
                str(report["id"]),
                serializer.validated_data,
            )
        return Response({"data": data})

    patch = put

    def delete(self, request, item_id):
        self.service_class.delete_by_batch(str(item_id))
        return Response({"data": {"success": True}})


class NJPView(StageView):
    service_class = NJPService
    serializer_class = NJPSerializer


class AssemblyView(StageView):
    service_class = AssemblyService
    serializer_class = AssemblySerializer


class StageStartView(APIView):
    def post(self, request, item_id, stage):
        serializer = StageLifecycleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = StageLifecycleService.start_stage(
            str(item_id),
            str(stage),
            serializer.validated_data,
        )
        return Response({"data": data}, status=status.HTTP_201_CREATED)


class StageEndView(APIView):
    serializers = {
        "mixing": MixingSerializer,
        "njp": NJPSerializer,
        "assembly": AssemblySerializer,
    }

    def post(self, request, item_id, stage):
        serializer_class = self.serializers.get(str(stage))
        if serializer_class is None:
            raise ServiceError("Unknown manufacturing stage", 400)
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = StageLifecycleService.complete_stage(
            str(item_id),
            str(stage),
            serializer.validated_data,
        )
        return Response({"data": data})


class TimelineView(APIView):
    def get(self, request, item_id):
        batch_id = str(item_id)
        data = {"batch": BatchService.get(batch_id)}
        for key, service in (
            ("mixing", MixingService),
            ("njp", NJPService),
            ("assembly", AssemblyService),
        ):
            try:
                data[key] = service.get_by_batch(batch_id)
            except Exception:
                data[key] = None
        return Response({"data": data})


class StageReportListView(APIView):
    service_class = None

    def get(self, request):
        filters = {}
        if request.query_params.get("batchId"):
            filters["batch_id"] = request.query_params["batchId"]
        if request.query_params.get("brandId"):
            filters["brand_id"] = request.query_params["brandId"]
        return Response(
            {
                "data": self.service_class.list(
                    filters=filters,
                    limit=int(request.query_params.get("limit", 500)),
                )
            }
        )


class MixingReportListView(StageReportListView):
    service_class = MixingService


class NJPReportListView(StageReportListView):
    service_class = NJPService


class AssemblyReportListView(StageReportListView):
    service_class = AssemblyService
