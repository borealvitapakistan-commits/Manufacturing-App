from rest_framework import serializers

LABEL_TYPES = ("capsule", "tablets", "softgel", "liquid", "lozengers", "powder")
LABEL_TYPE_ALIASES = {
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
LABEL_DOSAGE_TYPES = ("60", "90", "120", "180", "240")


def normalize_label_type(value):
    text = str(value or "capsule").strip().lower()
    normalized = LABEL_TYPE_ALIASES.get(text)
    if not normalized:
        allowed = ", ".join(LABEL_TYPES)
        raise serializers.ValidationError(f"Label type must be one of: {allowed}.")
    return normalized


class LabelSerializer(serializers.Serializer):
    brandId = serializers.UUIDField()
    productId = serializers.UUIDField()
    type = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="capsule")
    dosageType = serializers.ChoiceField(choices=LABEL_DOSAGE_TYPES, required=False, default="60")
    labelName = serializers.CharField(required=False, default="Standard Label", allow_blank=False)
    quantity = serializers.IntegerField(min_value=0)
    reorderLevel = serializers.IntegerField(min_value=0, required=False, default=0)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)

    def validate_type(self, value):
        return normalize_label_type(value)


class LabelValidationSerializer(serializers.Serializer):
    brandId = serializers.UUIDField()
    productId = serializers.UUIDField()
    required = serializers.IntegerField(min_value=0)
