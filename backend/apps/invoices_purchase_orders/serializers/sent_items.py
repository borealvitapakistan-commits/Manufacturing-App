from rest_framework import serializers

from apps.invoices_purchase_orders.services.sent_items import ITEM_TYPES


class SentItemSerializer(serializers.Serializer):
    vendorId = serializers.CharField()
    brandId = serializers.CharField()
    itemType = serializers.ChoiceField(choices=sorted(ITEM_TYPES))
    sourceId = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=18, decimal_places=6, min_value=0)
    sentAt = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

__all__ = ["SentItemSerializer"]
