from apps.common.api import TableDetailView, TableListCreateView
from apps.inventory.serializers.bottles_lids import BottleLidSerializer
from apps.inventory.services.bottles_lids import BottleLidService


class BottleLidListCreateView(TableListCreateView):
    service_class = BottleLidService
    serializer_class = BottleLidSerializer
    filter_map = {
        "bottleType": "bottle_type",
        "capsuleType": "capsule_type",
    }


class BottleLidDetailView(TableDetailView):
    service_class = BottleLidService
    serializer_class = BottleLidSerializer
