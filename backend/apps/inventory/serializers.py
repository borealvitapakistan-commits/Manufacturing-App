from rest_framework import serializers


class FinishedGoodsSerializer(serializers.Serializer):
    batchId = serializers.UUIDField()
    category = serializers.ChoiceField(
        choices=["powder", "capsule", "bottle"],
        required=False,
        default="powder",
    )
    name = serializers.CharField(required=False, allow_blank=True)
    location = serializers.CharField(required=False, allow_blank=True)
    comments = serializers.CharField(required=False, allow_blank=True)
    powderNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rackNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    weightKg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    capsuleCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bucket = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    capsuleMg = serializers.DecimalField(
        max_digits=10, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    capsuleWeightKg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    capsuleAmount = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    capsuleStatus = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    boxNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bottleTotal = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    expiryDate = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField()


class FinishedGoodsUpdateSerializer(FinishedGoodsSerializer):
    batchId = serializers.UUIDField(required=False)
    reason = serializers.CharField()
