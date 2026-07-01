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


def _has_value(value):
    return value not in (None, "")


def _first_value(attrs, *keys):
    for key in keys:
        value = attrs.get(key)
        if _has_value(value):
            return value
    return None


def _sync_category_aliases(attrs):
    """
    Keep category fields consistent.

    Clean fields:
    - rawMaterialCategoryId
    - rawMaterialCategoryName
    - rawMaterialCategoryCode

    Legacy aliases:
    - rmCategoryId / rmCategoryName / rmCategoryCode
    - categoryId / categoryName / categoryCode
    - category
    """

    category_id = _first_value(
        attrs,
        "rawMaterialCategoryId",
        "rmCategoryId",
        "categoryId",
    )
    category_name = _first_value(
        attrs,
        "rawMaterialCategoryName",
        "rmCategoryName",
        "categoryName",
        "category",
    )
    category_code = _first_value(
        attrs,
        "rawMaterialCategoryCode",
        "rmCategoryCode",
        "categoryCode",
    )

    if category_id is not None:
        attrs["rawMaterialCategoryId"] = category_id
        attrs["rmCategoryId"] = category_id
        attrs["categoryId"] = category_id

    if category_name is not None:
        attrs["rawMaterialCategoryName"] = category_name
        attrs["rmCategoryName"] = category_name
        attrs["categoryName"] = category_name
        attrs["category"] = category_name

    if category_code is not None:
        attrs["rawMaterialCategoryCode"] = category_code
        attrs["rmCategoryCode"] = category_code
        attrs["categoryCode"] = category_code

    return attrs


def _sync_dose_aliases(attrs, *, include_nmi_alias=False):
    """
    Keep dose fields consistent.

    Clean field:
    - doseMg

    Legacy aliases:
    - dosageMg
    - nmiDosageMg
    - labelClaimMgPerUnit
    """

    keys = ["doseMg"]

    if include_nmi_alias:
        keys.append("nmiDosageMg")

    keys.extend(["dosageMg", "labelClaimMgPerUnit"])

    dose = _first_value(attrs, *keys)

    if dose is not None:
        attrs["doseMg"] = dose
        attrs["dosageMg"] = dose
        attrs["labelClaimMgPerUnit"] = dose

        if include_nmi_alias:
            attrs["nmiDosageMg"] = dose

    return attrs


def _sync_kg_aliases(attrs):
    """
    Keep KG fields consistent.

    Clean field:
    - usedQtyKg

    Legacy aliases:
    - kgUsed
    - requiredQtyKgThisMix
    - requiredQtyKg
    - requiredQtyKgFormula
    """

    used_kg = _first_value(
        attrs,
        "usedQtyKg",
        "kgUsed",
        "requiredQtyKgThisMix",
        "requiredQtyKg",
        "requiredQtyKgFormula",
    )

    if used_kg is not None:
        attrs["usedQtyKg"] = used_kg
        attrs["kgUsed"] = used_kg

    return attrs


def _row_has_any_data(attrs):
    return any(
        [
            _has_value(attrs.get("rawMaterialId")),
            _has_value(attrs.get("rawMaterialCode")),
            _has_value(attrs.get("rawMaterialName")),
            _has_value(attrs.get("name")),
            _has_value(attrs.get("rawMaterialCategoryId")),
            _has_value(attrs.get("rawMaterialCategoryName")),
            _has_value(attrs.get("rawMaterialCategoryCode")),
            _has_value(attrs.get("rmCategoryId")),
            _has_value(attrs.get("rmCategoryName")),
            _has_value(attrs.get("rmCategoryCode")),
            _has_value(attrs.get("categoryId")),
            _has_value(attrs.get("categoryName")),
            _has_value(attrs.get("categoryCode")),
            _has_value(attrs.get("category")),
            attrs.get("doseMg") is not None,
            attrs.get("dosageMg") is not None,
            attrs.get("nmiDosageMg") is not None,
            attrs.get("labelClaimMgPerUnit") is not None,
            attrs.get("usedQtyKg") is not None,
            attrs.get("kgUsed") is not None,
            attrs.get("requiredQtyKgThisMix") is not None,
            attrs.get("requiredQtyKg") is not None,
            attrs.get("requiredQtyKgFormula") is not None,
            _has_value(attrs.get("remarks")),
        ]
    )


def _validate_selected_raw_material(attrs, *, section_label):
    """
    A material row must come from the dropdown.

    rawMaterialName is saved only as a snapshot/display value.
    rawMaterialName alone is not allowed as manual material entry.
    """

    if not _row_has_any_data(attrs):
        return attrs

    if not attrs.get("rawMaterialId"):
        raise serializers.ValidationError(
            {
                "rawMaterialId": (
                    f"Select {section_label} from dropdown. "
                    "Manual raw material name is not allowed."
                )
            }
        )

    if attrs.get("usedQtyKg") is None:
        raise serializers.ValidationError({"usedQtyKg": "KG used is required."})

    return attrs


class BatchSerializer(serializers.Serializer):
    brandId = serializers.UUIDField()
    productId = serializers.UUIDField()
    dosageForm = serializers.ChoiceField(choices=DOSAGE_FORMS)

    unitsPerContainer = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
    )
    containerCount = serializers.IntegerField(min_value=1)
    totalUnits = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )

    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    batchStatus = serializers.ChoiceField(
        choices=BATCH_LIFECYCLE_STATUSES,
        required=False,
    )
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


class MedicinalIngredientSerializer(serializers.Serializer):
    """
    Mixing section label:
    Medicinal Ingredients

    UI columns:
    - Raw Material Category
    - Raw Material Name dropdown
    - MG Dose Used
    - KG Used
    - Remarks

    Important:
    rawMaterialName is stored only as a selected-material snapshot.
    Manual rawMaterialName without rawMaterialId is not allowed.
    """

    clNo = serializers.IntegerField(min_value=1, required=False)

    rawMaterialCategoryId = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    rawMaterialCategoryName = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    rawMaterialCategoryCode = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )

    # Backward-compatible category aliases.
    rmCategoryId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rmCategoryName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rmCategoryCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoryId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoryName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoryCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    category = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    rawMaterialId = NullableUUIDField(required=False, allow_null=True)
    rawMaterialCode = serializers.CharField(required=False, allow_blank=True)
    rawMaterialName = serializers.CharField(required=False, allow_blank=True)

    # Legacy display alias only. Do not use this for manual entry.
    name = serializers.CharField(required=False, allow_blank=True)

    doseMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible MG aliases.
    labelClaimMgPerUnit = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    dosageMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    usedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible KG aliases.
    kgUsed = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgFormula = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgThisMix = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    qtyBeforeKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )
    qtyAfterKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )

    totalUnits = serializers.IntegerField(min_value=0, required=False, allow_null=True)

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        attrs = _sync_category_aliases(attrs)
        attrs = _sync_dose_aliases(attrs)
        attrs = _sync_kg_aliases(attrs)

        if _has_value(attrs.get("rawMaterialName")):
            attrs["rawMaterialName"] = attrs["rawMaterialName"].strip()

        if not _has_value(attrs.get("rawMaterialName")) and _has_value(attrs.get("name")):
            attrs["rawMaterialName"] = attrs["name"].strip()

        if _has_value(attrs.get("rawMaterialName")):
            attrs["name"] = attrs["rawMaterialName"]

        attrs = _validate_selected_raw_material(
            attrs,
            section_label="raw material",
        )

        if _row_has_any_data(attrs):
            has_category = any(
                [
                    _has_value(attrs.get("rawMaterialCategoryId")),
                    _has_value(attrs.get("rawMaterialCategoryName")),
                    _has_value(attrs.get("rawMaterialCategoryCode")),
                ]
            )

            if not has_category:
                raise serializers.ValidationError(
                    {
                        "rawMaterialCategoryId": (
                            "Raw material category is required for medicinal ingredients."
                        )
                    }
                )

        return attrs


class NonMedicinalIngredientSerializer(serializers.Serializer):
    """
    Mixing section label:
    Non-Medicinal Ingredients

    Important:
    NMI raw materials should come from Raw Material category = MMA.
    Frontend should filter NMI dropdown from MMA category.

    UI columns:
    - Select NMI
    - Dosage mg
    - KG Used
    - Remarks

    rawMaterialName is stored only as a selected-material snapshot.
    Manual rawMaterialName without rawMaterialId is not allowed.
    """

    clNo = serializers.IntegerField(min_value=1, required=False)

    rawMaterialId = NullableUUIDField(required=False, allow_null=True)
    rawMaterialCode = serializers.CharField(required=False, allow_blank=True)
    rawMaterialName = serializers.CharField(required=False, allow_blank=True)

    # Legacy display alias only. Do not use this for manual entry.
    name = serializers.CharField(required=False, allow_blank=True)

    doseMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Frontend may use any of these names.
    dosageMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    nmiDosageMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    labelClaimMgPerUnit = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    usedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    kgUsed = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgFormula = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgThisMix = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    qtyBeforeKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )
    qtyAfterKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )

    # Backend can keep these as forced MMA for compatibility/reporting.
    rawMaterialCategoryId = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    rawMaterialCategoryName = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    rawMaterialCategoryCode = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    rmCategoryId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rmCategoryName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rmCategoryCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoryId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoryName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoryCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    category = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    isNMI = serializers.BooleanField(required=False)
    isNonMedicinal = serializers.BooleanField(required=False)

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        attrs = _sync_dose_aliases(attrs, include_nmi_alias=True)
        attrs = _sync_kg_aliases(attrs)

        if _has_value(attrs.get("rawMaterialName")):
            attrs["rawMaterialName"] = attrs["rawMaterialName"].strip()

        if not _has_value(attrs.get("rawMaterialName")) and _has_value(attrs.get("name")):
            attrs["rawMaterialName"] = attrs["name"].strip()

        if _has_value(attrs.get("rawMaterialName")):
            attrs["name"] = attrs["rawMaterialName"]

        attrs = _validate_selected_raw_material(
            attrs,
            section_label="NMI",
        )

        if _row_has_any_data(attrs):
            attrs["rawMaterialCategoryId"] = attrs.get("rawMaterialCategoryId") or "MMA"
            attrs["rawMaterialCategoryName"] = attrs.get("rawMaterialCategoryName") or "MMA"
            attrs["rawMaterialCategoryCode"] = attrs.get("rawMaterialCategoryCode") or "MMA"

            attrs["rmCategoryId"] = attrs.get("rmCategoryId") or attrs["rawMaterialCategoryId"]
            attrs["rmCategoryName"] = attrs.get("rmCategoryName") or attrs["rawMaterialCategoryName"]
            attrs["rmCategoryCode"] = attrs.get("rmCategoryCode") or attrs["rawMaterialCategoryCode"]

            attrs["categoryId"] = attrs.get("categoryId") or attrs["rawMaterialCategoryId"]
            attrs["categoryName"] = attrs.get("categoryName") or attrs["rawMaterialCategoryName"]
            attrs["categoryCode"] = attrs.get("categoryCode") or attrs["rawMaterialCategoryCode"]
            attrs["category"] = attrs.get("category") or "MMA"

            attrs["isNMI"] = True
            attrs["isNonMedicinal"] = True

        return attrs


# Backward compatibility for services/frontend that still import/use UsageItemSerializer.
# Keep the old generic name mapped to medicinal ingredients.
UsageItemSerializer = MedicinalIngredientSerializer


class MixingSessionSerializer(serializers.Serializer):
    date = serializers.IntegerField(required=False, allow_null=True)

    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)


def _list_from_attrs(attrs, key):
    value = attrs.get(key)
    return value if isinstance(value, list) else []


def _sync_mixing_aliases(attrs):
    """
    Keep old and new payload names working together.

    Clean names:
    - medicinalIngredients
    - nonMedicinalIngredients
    - totalKgInMixing

    Old names still supported:
    - rmUsage
    - byBookRawMaterials
    - pragmaticRawMaterials
    - nonMedUsage
    - totalMixedQtyKg

    Important:
    There is no mixing status field here.
    Mixing start/end state belongs to lifecycle endpoints, not this mixing payload.
    """

    medicinal = _list_from_attrs(attrs, "medicinalIngredients")

    if not medicinal:
        medicinal = (
            _list_from_attrs(attrs, "rmUsage")
            + _list_from_attrs(attrs, "byBookRawMaterials")
            + _list_from_attrs(attrs, "pragmaticRawMaterials")
        )

    non_medicinal = _list_from_attrs(attrs, "nonMedicinalIngredients")

    if not non_medicinal:
        non_medicinal = _list_from_attrs(attrs, "nonMedUsage")

    attrs["medicinalIngredients"] = medicinal
    attrs["rmUsage"] = medicinal
    attrs["byBookRawMaterials"] = medicinal

    if "pragmaticRawMaterials" not in attrs:
        attrs["pragmaticRawMaterials"] = []

    attrs["nonMedicinalIngredients"] = non_medicinal
    attrs["nonMedUsage"] = non_medicinal

    total_kg = _first_value(
        attrs,
        "totalKgInMixing",
        "totalKg",
        "totalMixingKg",
        "totalMixedQtyKg",
    )

    if total_kg is not None:
        attrs["totalKgInMixing"] = total_kg
        attrs["totalKg"] = total_kg
        attrs["totalMixingKg"] = total_kg
        attrs["totalMixedQtyKg"] = total_kg

    if attrs.get("mixedPowderName") is not None:
        attrs["mixedPowderName"] = attrs["mixedPowderName"].strip()

    return attrs


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
    mixedPowderQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    existingMixedPowderUsedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    totalFormulaQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Manual total KG field for Mixing.
    totalKgInMixing = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible total KG aliases.
    totalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixingKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
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
        return _sync_mixing_aliases(attrs)


class StandaloneMixingSerializer(serializers.Serializer):
    brandId = serializers.CharField()
    brandName = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    productId = serializers.CharField()
    productName = serializers.CharField()

    mixingCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)

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
    existingMixedPowderUsedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
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
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Manual total KG field.
    totalKgInMixing = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible total KG aliases.
    totalKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixingKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalMixedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
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
        return _sync_mixing_aliases(attrs)


class StageLifecycleSerializer(serializers.Serializer):
    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    status = serializers.ChoiceField(choices=STAGE_LIFECYCLE_STATUSES, required=False)

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    changeReason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class NJPSerializer(serializers.Serializer):
    njpCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    lotNumber = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    capsuleSize = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    machineModel = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    machineSpeed = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    rawMaterialReceivedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
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
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    totalCapsulesFilledQty = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    rejectedCapsulesQty = serializers.IntegerField(
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

    status = serializers.ChoiceField(
        choices=["In NJP", "NJP Completed"],
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


class AssemblySerializer(serializers.Serializer):
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
        decimal_places=4,
        min_value=0,
        required=False,
        allow_null=True,
    )
    capsulesReceivedQty = serializers.IntegerField(
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
        choices=["In Assembly", "Assembly Completed"],
        required=False,
    )

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    changeReason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

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
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    finalQuantities = serializers.DictField(required=False)