from rest_framework.response import Response
from rest_framework.views import APIView

from services.batch_service import AssemblyService, BatchService, MixingService, NJPService
from services.catalog_service import RawMaterialService
from services.finance_service import ExpenseService
from services.hr_service import SalarySheetService
from services.pricing_service import BatchPricingService
from services.procurement_service import PurchaseOrderService


def batch_report(batch_id: str):
    data = {"batch": BatchService.get(batch_id)}
    for name, service in (
        ("mixing", MixingService),
        ("njp", NJPService),
        ("assembly", AssemblyService),
    ):
        try:
            data[name] = service.get_by_batch(batch_id)
        except Exception:
            data[name] = None
    return data


class BatchTraceabilityView(APIView):
    def get(self, request, batch_id):
        return Response({"data": batch_report(str(batch_id))})


class BatchPricingView(APIView):
    def get(self, request, batch_id):
        return Response({"data": BatchPricingService.calculate(str(batch_id))})

    def post(self, request, batch_id):
        return Response(
            {
                "data": BatchPricingService.calculate(
                    str(batch_id),
                    dict(request.data),
                )
            }
        )


class InventorySummaryView(APIView):
    def get(self, request):
        data = RawMaterialService.list(limit=500)
        return Response(
            {
                "data": {
                    "items": data,
                    "totalStockKg": round(sum(float(item.get("qtyKg") or 0) for item in data), 4),
                    "totalValue": round(
                        sum(
                            float(item.get("qtyKg") or 0) * float(item.get("pricePerKg") or 0)
                            for item in data
                        ),
                        4,
                    ),
                }
            }
        )


class PayrollSummaryView(APIView):
    def get(self, request):
        rows = SalarySheetService.list(
            filters={
                key: request.query_params.get(key)
                for key in ("year", "month")
                if request.query_params.get(key)
            },
            limit=500,
        )
        return Response(
            {
                "data": {
                    "items": rows,
                    "netPayable": round(sum(float(row.get("netPayable") or 0) for row in rows), 2),
                }
            }
        )


class ExpenseSummaryView(APIView):
    def get(self, request):
        filters = {}
        if request.query_params.get("bookId"):
            filters["book_id"] = request.query_params["bookId"]
        rows = ExpenseService.list(filters=filters, limit=500)
        debit = sum(float(row.get("amount") or 0) for row in rows if row.get("direction") == "debit")
        credit = sum(float(row.get("amount") or 0) for row in rows if row.get("direction") == "credit")
        return Response({"data": {"items": rows, "debit": debit, "credit": credit, "balance": credit - debit}})


class PurchaseOrderReportView(APIView):
    def get(self, request, po_id):
        return Response({"data": PurchaseOrderService.get(str(po_id))})
