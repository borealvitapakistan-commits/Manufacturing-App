from rest_framework import serializers


class RawMaterialSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    qty = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False)
    qtyKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False)
    category = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    pricePerKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0)
    code = serializers.CharField(required=False, allow_blank=True)
    coaLink = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    comments = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if not self.partial and "qty" not in attrs and "qtyKg" not in attrs:
            raise serializers.ValidationError({"qty": "Quantity is required."})
        return attrs
