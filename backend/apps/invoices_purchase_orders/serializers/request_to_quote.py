from rest_framework import serializers

ORDER_TYPES = ["raw_material", "label", "product", "bottles_lids", "custom"]
RTQ_STATUSES = ["draft", "sent", "received", "canceled"]


class RequestToQuoteItemSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_blank=True)
    sr = serializers.IntegerField(required=False)
    orderType = serializers.ChoiceField(choices=ORDER_TYPES, default="raw_material")
    itemId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    itemName = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=0)
    unitPrice = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    totalPrice = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=0, required=False, allow_null=True
    )


class RequestToQuoteSerializer(serializers.Serializer):
    vendorId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    vendorName = serializers.CharField(required=False, allow_blank=True)
    vendorAddress = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    shipToName = serializers.CharField(required=False, allow_blank=True)
    shipToAddress = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    shipToPhone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    brandId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rtqDate = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    termsConditions = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(choices=RTQ_STATUSES, required=False, default="draft")
    items = RequestToQuoteItemSerializer(many=True, required=False, default=list)


__all__ = ["RequestToQuoteSerializer", "RequestToQuoteItemSerializer", "ORDER_TYPES", "RTQ_STATUSES"]
