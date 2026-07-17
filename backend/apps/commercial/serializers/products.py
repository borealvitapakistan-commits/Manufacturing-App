from rest_framework import serializers

from apps.common.serializers import NullableUUIDField

PRODUCT_TYPES = ("capsule", "tablets", "softgel", "liquid", "lozengers", "powder")
PRODUCT_TYPE_ALIASES = {
    "capsule": "capsule",
    "capsules": "capsule",
    "tablet": "tablets",
    "tablets": "tablets",
    "softgel": "softgel",
    "softgels": "softgel",
    "liquid": "liquid",
    "lozenger": "lozengers",
    "lozengers": "lozengers",
    "lozenge": "lozengers",
    "lozenges": "lozengers",
    "powder": "powder",
}


def normalize_product_type(value):
    text = str(value or "capsule").strip().lower()
    normalized = PRODUCT_TYPE_ALIASES.get(text)
    if not normalized:
        allowed = ", ".join(PRODUCT_TYPES)
        raise serializers.ValidationError(f"Product type must be one of: {allowed}.")
    return normalized


class ProductRawMaterialSerializer(serializers.Serializer):
    sr = serializers.IntegerField(min_value=1)
    rawMaterial = serializers.CharField()
    rawMaterialCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rawMaterialId = NullableUUIDField(required=False, allow_null=True)
    categoryId = NullableUUIDField(required=False, allow_null=True)
    labelClaim = serializers.CharField()
    labelClaimMgPerUnit = serializers.DecimalField(max_digits=14, decimal_places=6, min_value=0)


class ProductSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    type = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="capsule")
    npn = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rm = ProductRawMaterialSerializer(many=True, allow_empty=False)

    def validate_type(self, value):
        return normalize_product_type(value)

    def validate_rm(self, value):
        if any(not row.get("rawMaterialId") for row in value):
            raise serializers.ValidationError(
                "Select a raw material from the list for every RM row."
            )
        return value
