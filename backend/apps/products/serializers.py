from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


class ProductRawMaterialSerializer(serializers.Serializer):
    sr = serializers.IntegerField(min_value=1)
    rawMaterial = serializers.CharField()
    rawMaterialCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rawMaterialId = NullableUUIDField(required=False, allow_null=True)
    labelClaim = serializers.CharField()
    labelClaimMgPerUnit = serializers.DecimalField(max_digits=14, decimal_places=6, min_value=0)


class ProductSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    npn = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rm = ProductRawMaterialSerializer(many=True, allow_empty=False)

    def validate_rm(self, value):
        if any(not row.get("rawMaterialId") for row in value):
            raise serializers.ValidationError(
                "Select a raw material from the list for every RM row."
            )
        return value
