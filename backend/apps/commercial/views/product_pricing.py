from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commercial.services.product_pricing import ProductPricingService


class ProductPricingView(APIView):
    def post(self, request, product_id):
        return Response(
            {
                "data": ProductPricingService.calculate_for_product(
                    str(product_id),
                    dict(request.data),
                )
            }
        )


class CurrencyRateView(APIView):
    def get(self, request):
        return Response({"data": ProductPricingService.current_cad_rate()})
