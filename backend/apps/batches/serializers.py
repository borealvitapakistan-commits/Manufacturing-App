from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


DOSAGE_FORMS = ["capsule", "tablet", "softgel", "lozenge", "oil", "liquid", "other"]
BATCH_STATUSES = ["mixingPending", "ngpPending", "assemblyPending", "finalized"]
BATCH_LIFECYCLE_STATUSES = [
    "Batch Created",
    "In Mixing",
    "Mixing Completed",
    "In NJP",
    "NJP Completed",
    "In Assembly",
    "Assembly Completed",
    "Completed",
]
CURRENT_STAGES = ["batch", "mixing", "njp", "assembly", "finished_goods"]
STAGE_LIFECYCLE_STATUSES = [
    "In Mixing",
    "Mixing Completed",
    "In NJP",
    "NJP Completed",
    "In Assembly",
    "Assembly Completed",
]
UNIT_BASED_FORMS = {"capsule", "tablet", "softgel", "lozenge", "oil"}


class BatchSerializer(serializers.Serializer):
    brandId = serializers.UUIDField()
    productId = serializers.UUIDField()
    dosageForm = serializers.ChoiceField(choices=DOSAGE_FORMS)
    unitsPerContainer = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    containerCount = serializers.IntegerField(min_value=1)
    totalUnits = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    batchStatus = serializers.ChoiceField(choices=BATCH_LIFECYCLE_STATUSES, required=False)
    currentStage = serializers.ChoiceField(choices=CURRENT_STAGES, required=False)
    batchStartDate = serializers.IntegerField(required=False, allow_null=True)
    batchStartTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    batchEndDate = serializers.IntegerField(required=False, allow_null=True)
    batchEndTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    batchRemarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    manualBatchCode = serializers.CharField(required=False, allow_blank=True)
    createdBy = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(choices=BATCH_STATUSES, required=False)
    hasMixing = serializers.BooleanField(required=False)
    hasNJP = serializers.BooleanField(required=False)
    hasAssembly = serializers.BooleanField(required=False)

    def validate(self, attrs):
        dosage_form = attrs.get("dosageForm")
        units = attrs.get("unitsPerContainer")
        containers = attrs.get("containerCount")
        if dosage_form in UNIT_BASED_FORMS and not self.partial and units is None:
            raise serializers.ValidationError(
                {"unitsPerContainer": "Enter units per container."}
            )
        if dosage_form in UNIT_BASED_FORMS and units is not None and containers is not None:
            if units * containers <= 0:
                raise serializers.ValidationError(
                    {"totalUnits": "Total units cannot be zero."}
                )
        if attrs.get("manualBatchCode") is not None:
            attrs["manualBatchCode"] = attrs["manualBatchCode"].strip()
        return attrs


class UsageItemSerializer(serializers.Serializer):
    clNo = serializers.IntegerField(min_value=1, required=False)
    name = serializers.CharField(required=False, allow_blank=True)
    rawMaterialId = NullableUUIDField(required=False, allow_null=True)
    rawMaterialCode = serializers.CharField(required=False, allow_blank=True)
    rawMaterialName = serializers.CharField(required=False, allow_blank=True)
    labelClaimMgPerUnit = serializers.DecimalField(max_digits=14, decimal_places=6, required=False)
    totalUnits = serializers.IntegerField(min_value=0, required=False)
    requiredQtyKgFormula = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False
    )
    requiredQtyKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False)
    requiredQtyKgThisMix = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False)
    qtyBeforeKg = serializers.DecimalField(max_digits=12, decimal_places=4, required=False)
    qtyAfterKg = serializers.DecimalField(max_digits=12, decimal_places=4, required=False)
    usedQtyKg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False
    )

    def validate(self, attrs):
        if not any(
            attrs.get(key) is not None
            for key in ("usedQtyKg", "requiredQtyKgThisMix", "requiredQtyKg")
        ):
            raise serializers.ValidationError(
                "A used or required quantity is required."
            )
        return attrs


class MixingSerializer(serializers.Serializer):
    rmUsage = UsageItemSerializer(many=True)
    nonMedUsage = UsageItemSerializer(many=True, required=False, default=list)
    mixingDates = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    mixingNotes = serializers.CharField(required=False, allow_blank=True, default="")
    mixingDate = serializers.IntegerField(required=False, allow_null=True)
    mixedPowderName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    mixedPowderQtyKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True)
    totalFormulaQtyKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True)
    totalMixedQtyKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True)
    existingMixedPowderUsedKg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True)
    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(choices=["In Mixing", "Mixing Completed"], required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StageLifecycleSerializer(serializers.Serializer):
    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(choices=STAGE_LIFECYCLE_STATUSES, required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class NJPSerializer(serializers.Serializer):
    njpCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    lotNumber = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    capsuleSize = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    machineModel = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    machineSpeed = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rawMaterialReceivedKg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    targetFillWeightMg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    totalCapsulesProducedKg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    totalCapsulesFilledQty = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    rejectedCapsulesQty = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    temperatureC = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True
    )
    temperatureF = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True
    )
    humidityPercent = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, max_value=100, required=False, allow_null=True
    )
    dusterCheck = serializers.BooleanField(required=False, default=False)
    vacuumCheck = serializers.BooleanField(required=False, default=False)
    yieldPercent = serializers.DecimalField(
        max_digits=8, decimal_places=4, min_value=0, max_value=100, required=False, allow_null=True
    )
    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    productionDate = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=["In NJP", "NJP Completed"], required=False)
    loadChecks = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    operatorName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    capsuleData = serializers.DictField(required=False)



class AssemblySerializer(serializers.Serializer):
    capsuleWeight = serializers.DecimalField(
        max_digits=10, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    capsuleWeightMg = serializers.DecimalField(
        max_digits=10, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    filledBottleWeight = serializers.DecimalField(
        max_digits=10, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    capsulesReceivedKg = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    capsulesReceivedQty = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    productionDate = serializers.IntegerField(required=False, allow_null=True)
    expiryDate = serializers.IntegerField(required=False, allow_null=True)
    startDate = serializers.IntegerField(required=False, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    qualityControlDate = serializers.IntegerField(required=False, allow_null=True)
    qcDate = serializers.IntegerField(required=False, allow_null=True)
    qualityControlStartTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    qualityControlEndTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    qcStartTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    qcEndTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    packagingDate = serializers.IntegerField(required=False, allow_null=True)
    packageDate = serializers.IntegerField(required=False, allow_null=True)
    packagingStartTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    packagingEndTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(choices=["In Assembly", "Assembly Completed"], required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    totalBottlesMade = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    bottleCC = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    capsulesPerBottle = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    receivedCapsuleBucketNumber = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    receivedCapsulesProductionDate = serializers.IntegerField(required=False, allow_null=True)
    operatorName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    finalQuantities = serializers.DictField(required=False)
