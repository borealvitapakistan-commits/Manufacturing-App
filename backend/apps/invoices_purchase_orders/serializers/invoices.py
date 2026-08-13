from rest_framework import serializers


class InvoiceSerializer(serializers.Serializer):
    poNumber = serializers.CharField(required=False, allow_blank=True)
    comments = serializers.CharField(required=False, allow_blank=True, allow_null=True)


__all__ = ["InvoiceSerializer"]
