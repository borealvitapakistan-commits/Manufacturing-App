from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


class RawMaterialSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    qty = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False)
    qtyKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False)
    categoryId = NullableUUIDField(required=False, allow_null=True)
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


class RawMaterialCategorySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)
