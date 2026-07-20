from rest_framework import serializers

from apps.manufacturing.serializers.base import MixingSessionSerializer

class AssemblySerializer(serializers.Serializer):
    assemblyCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    batchCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    batchCodeDisplay = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    brandBatchCodes = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )

    # Local Assembly is created from a saved standalone NJP capsule record.
    njpId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    njpCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
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
    boxNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    sourceLocation = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    sourceBucket = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    capsuleWeight = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsuleWeightMg = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    filledBottleWeight = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    capsulesReceivedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesReceivedQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    calculatedCapsulesReceivedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesAvailableBeforeAssemblyQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesUsedInAssemblyQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesAvailableAfterAssemblyQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesAvailableBeforeAssemblyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesUsedInAssemblyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesAvailableAfterAssemblyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    productionDate = serializers.IntegerField(required=False, allow_null=True)
    expiryDate = serializers.IntegerField(required=False, allow_null=True)

    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    assemblySessions = MixingSessionSerializer(many=True, required=False, default=list)
    assemblyTimeLogs = MixingSessionSerializer(many=True, required=False, default=list)
    timeLogs = MixingSessionSerializer(many=True, required=False, default=list)

    qualityControlDate = serializers.IntegerField(required=False, allow_null=True)
    qcDate = serializers.IntegerField(required=False, allow_null=True)
    qualityControlStartTime = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    qualityControlEndTime = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    qcStartTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    qcEndTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    packagingDate = serializers.IntegerField(required=False, allow_null=True)
    packageDate = serializers.IntegerField(required=False, allow_null=True)
    packagingStartTime = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    packagingEndTime = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    status = serializers.ChoiceField(
        choices=["Underprocess", "Completed", "In Assembly", "Assembly Completed"],
        required=False,
    )

    comments = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    totalBottlesMade = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    bottleCC = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesPerBottle = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    looseCapsulesQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    remainingCapsulesAfterBottlingQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    bottleLidId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bottleType = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bottleCapsuleType = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bottleSize = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bottleInventoryBeforeQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    bottleInventoryUsedQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    bottleInventoryAfterQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )

    totalLabelsUsed = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    labelId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    labelInventoryBeforeQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    labelInventoryUsedQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    labelInventoryAfterQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )

    receivedCapsuleBucketNumber = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    receivedCapsulesProductionDate = serializers.IntegerField(
        required=False,
        allow_null=True,
    )

    operatorName = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    finalQuantities = serializers.DictField(required=False)
    capsuleData = serializers.DictField(required=False)

__all__ = ["AssemblySerializer"]