from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api import TableDetailView, TableListCreateView
from services.finance_service import ExpenseBookService, ExpenseService

from .serializers import (
    CloseExpenseBookSerializer,
    ExpenseBookSerializer,
    ExpenseSerializer,
    PullCarrySerializer,
)


class ExpenseBookListCreateView(TableListCreateView):
    service_class = ExpenseBookService
    serializer_class = ExpenseBookSerializer
    filter_map = {"status": "status", "active": "is_active"}
    search_column = "name"

    def get_filters(self, request):
        filters = super().get_filters(request)
        if request.query_params.get("openOnly", "").lower() == "true":
            filters.update({"status": "open", "is_active": True})
        return filters


class ExpenseBookDetailView(TableDetailView):
    service_class = ExpenseBookService
    serializer_class = ExpenseBookSerializer


class CloseExpenseBookView(APIView):
    def post(self, request, item_id):
        serializer = CloseExpenseBookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        return Response(
            {
                "data": ExpenseBookService.close(
                    str(item_id),
                    mode=values["mode"],
                    target_book_id=str(values["targetBookId"])
                    if values.get("targetBookId")
                    else None,
                    new_book_name=values.get("newBookName"),
                    source_description=values.get("sourceDescription"),
                )
            }
        )


class ExpenseListCreateView(TableListCreateView):
    service_class = ExpenseService
    serializer_class = ExpenseSerializer
    filter_map = {"bookId": "book_id", "direction": "direction", "type": "type"}


class ExpenseDetailView(TableDetailView):
    service_class = ExpenseService
    serializer_class = ExpenseSerializer


class ReopenExpenseBookView(APIView):
    def post(self, request, item_id):
        return Response(
            {
                "data": ExpenseBookService.update(
                    str(item_id),
                    {
                        "status": "open",
                        "isActive": True,
                        "closedAt": None,
                    },
                )
            }
        )


class ExpenseBookBalanceView(APIView):
    def get(self, request, item_id):
        return Response({"data": ExpenseBookService.balance(str(item_id))})


class PullCarryView(APIView):
    def post(self, request, item_id):
        serializer = PullCarrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            {
                "data": ExpenseBookService.pull_carry(
                    str(item_id),
                    str(serializer.validated_data["targetBookId"]),
                )
            }
        )
