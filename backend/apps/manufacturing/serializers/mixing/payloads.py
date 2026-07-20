from rest_framework import serializers

from apps.manufacturing.serializers.base import MixingSessionSerializer
from .helpers import _sync_mixing_aliases
from .ingredients import MedicinalIngredientSerializer, NonMedicinalIngredientSerializer

class MixingSerializer(serializers.Serializer):
    # Clean names.
    medicinalIngredients = MedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )
    nonMedicinalIngredients = NonMedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )

    # Backward-compatible old names.
    rmUsage = MedicinalIngredientSerializer(many=True, required=False, default=list)
    nonMedUsage = NonMedicinalIngredientSerializer(many=True, required=False, default=list)

    # Alternate legacy/local names.
    byBookRawMaterials = MedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )
    pragmaticRawMaterials = MedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )

    mixingDates = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    mixingNotes = serializers.CharField(required=False, allow_blank=True, default="")
    rackNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Single-day timing.
    mixingDate = serializers.IntegerField(required=False, allow_null=True)
    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Multi-day timing.
    mixingSessions = MixingSessionSerializer(many=True, required=False, default=list)
    mixingTimeLogs = MixingSessionSerializer(many=True, required=False, default=list)
    timeLogs = MixingSessionSerializer(many=True, required=False, default=list)

    # TBD: mixed powder name will be discussed later.
    mixedPowderName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowderId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowderCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowderSource = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowder = serializers.JSONField(required=False, allow_null=True)
    mixedPowderQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    existingMixedPowderUsedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    totalFormulaQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    freshMixingRequiredKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    calculatedFreshRawMaterialsTotalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Manual total KG field for Mixing.
    totalKgInMixing = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible total KG aliases.
    totalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixingKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # No status field here.
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    changeReason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    operatorName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    createdBy = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        present_keys = set(self.initial_data.keys()) if isinstance(self.initial_data, dict) else None
        return _sync_mixing_aliases(attrs, present_keys=present_keys)


class StandaloneMixingSerializer(serializers.Serializer):
    brandId = serializers.CharField()
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

    productId = serializers.CharField()
    productName = serializers.CharField()
    productCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    productNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    productNumber = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    productNpn = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_npn = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    npn = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    mixingCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rackNo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Single-day timing.
    mixingDate = serializers.IntegerField(required=False, allow_null=True)
    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Multi-day timing.
    mixingSessions = MixingSessionSerializer(many=True, required=False, default=list)
    mixingTimeLogs = MixingSessionSerializer(many=True, required=False, default=list)
    timeLogs = MixingSessionSerializer(many=True, required=False, default=list)

    # TBD: mixed powder name will be discussed later.
    mixedPowderName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowderId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowderCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowderSource = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    existingMixedPowder = serializers.JSONField(required=False, allow_null=True)
    existingMixedPowderUsedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Clean names.
    medicinalIngredients = MedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )
    nonMedicinalIngredients = NonMedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )

    # Backward-compatible old names.
    byBookRawMaterials = MedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )
    pragmaticRawMaterials = MedicinalIngredientSerializer(
        many=True,
        required=False,
        default=list,
    )
    rmUsage = MedicinalIngredientSerializer(many=True, required=False, default=list)
    nonMedUsage = NonMedicinalIngredientSerializer(many=True, required=False, default=list)

    totalFormulaQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    freshMixingRequiredKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    calculatedFreshRawMaterialsTotalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Manual total KG field.
    totalKgInMixing = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible total KG aliases.
    totalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixingKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # No status field here.
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    changeReason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    operatorName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    createdBy = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        present_keys = set(self.initial_data.keys()) if isinstance(self.initial_data, dict) else None
        return _sync_mixing_aliases(attrs, present_keys=present_keys)

__all__ = ["MixingSerializer", "StandaloneMixingSerializer"]