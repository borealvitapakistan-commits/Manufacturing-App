from rest_framework import serializers

from apps.manufacturing.serializers.base import MixingSessionSerializer

class NJPSerializer(serializers.Serializer):
    # Local NJP is created from a saved standalone Mixing record.
    mixingId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mixingCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mixingName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    brandId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    brandName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    brandIds = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=list,
    )
    brandNames = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=list,
    )
    brands = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
    productId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    productName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rackNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bucket = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mixingTotalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    mixingAvailableKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    mixingAvailableBeforeNJPkg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    mixingUsedInNJPkg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    mixingAvailableAfterNJPkg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    njpCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    lotNumber = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    capsuleSize = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    machineModel = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    machineSpeed = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    rawMaterialReceivedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    targetFillWeightMg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalCapsulesProducedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    emptyCapsuleUnitWeightMg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    emptyCapsuleWeightMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    emptyCapsuleWeightKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalCapsulesFilledQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    grossCapsulesFilledQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    netCapsulesFilledQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    rejectedCapsulesQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    rejectedCapsulesWeightKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    temperatureC = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    temperatureF = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    humidityPercent = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=0,
        max_value=100,
        required=False,
        allow_null=True,
    )

    dusterCheck = serializers.BooleanField(required=False, default=False)
    vacuumCheck = serializers.BooleanField(required=False, default=False)

    yieldPercent = serializers.DecimalField(
        max_digits=8,
        decimal_places=4,
        min_value=0,
        max_value=100,
        required=False,
        allow_null=True,
    )

    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    productionDate = serializers.IntegerField(required=False, allow_null=True)
    njpSessions = MixingSessionSerializer(many=True, required=False, default=list)
    njpTimeLogs = MixingSessionSerializer(many=True, required=False, default=list)
    timeLogs = MixingSessionSerializer(many=True, required=False, default=list)

    status = serializers.ChoiceField(
        choices=["Underprocess", "Completed", "In NJP", "NJP Completed"],
        required=False,
    )

    loadChecks = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    changeReason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    operatorName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    capsuleData = serializers.DictField(required=False)

__all__ = ["NJPSerializer"]