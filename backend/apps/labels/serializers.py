from rest_framework import serializers

LABEL_TYPES = ("capsule", "tablets", "softgel", "liquid", "lozengers", "powder")
LABEL_DOSAGE_TYPES = ("60", "90", "120", "180", "240")


class LabelSerializer(serializers.Serializer):
    brandId = serializers.UUIDField()
    productId = serializers.UUIDField()
    type = serializers.ChoiceField(choices=LABEL_TYPES, required=False, default="capsule")
    dosageType = serializers.ChoiceField(choices=LABEL_DOSAGE_TYPES, required=False, default="60")
    labelName = serializers.CharField(required=False, default="Standard Label", allow_blank=False)
    quantity = serializers.IntegerField(min_value=0)
    reorderLevel = serializers.IntegerField(min_value=0, required=False, default=0)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)


class LabelValidationSerializer(serializers.Serializer):
    brandId = serializers.UUIDField()
    productId = serializers.UUIDField()
    required = serializers.IntegerField(min_value=0)
