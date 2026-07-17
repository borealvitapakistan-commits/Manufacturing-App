"""Serializers for active manufacturing traceability entities."""

from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


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

    keys = ["doseMg", "mgDoseUsed", "mgDose"]

    if include_nmi_alias:
        keys.append("nmiDosageMg")

    keys.extend(["dosageMg", "labelClaimMgPerUnit", "labelClaimMg"])

    dose = _first_value(attrs, *keys)

    if dose is not None:
        attrs["doseMg"] = dose
        attrs["mgDoseUsed"] = dose
        attrs["mgDose"] = dose
        attrs["dosageMg"] = dose
        attrs["labelClaimMgPerUnit"] = dose
        attrs["labelClaimMg"] = dose

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
        "qtyUsedKg",
        "requiredQtyKgThisMix",
        "requiredQtyKg",
        "requiredQtyKgFormula",
    )

    if used_kg is not None:
        attrs["usedQtyKg"] = used_kg
        attrs["kgUsed"] = used_kg
        attrs["qtyUsedKg"] = used_kg
        attrs["requiredQtyKgThisMix"] = used_kg

    return attrs


def _sync_percent_aliases(attrs):
    percent = _first_value(attrs, "percentShare", "ratioPercent")
    if percent is not None:
        attrs["percentShare"] = percent
        attrs["ratioPercent"] = percent
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
            attrs.get("mgDoseUsed") is not None,
            attrs.get("mgDose") is not None,
            attrs.get("dosageMg") is not None,
            attrs.get("nmiDosageMg") is not None,
            attrs.get("labelClaimMgPerUnit") is not None,
            attrs.get("labelClaimMg") is not None,
            attrs.get("usedQtyKg") is not None,
            attrs.get("kgUsed") is not None,
            attrs.get("qtyUsedKg") is not None,
            attrs.get("requiredQtyKgThisMix") is not None,
            attrs.get("requiredQtyKg") is not None,
            attrs.get("requiredQtyKgFormula") is not None,
            attrs.get("percentShare") is not None,
            attrs.get("ratioPercent") is not None,
            _has_value(attrs.get("remarks")),
        ]
    )


def _validate_selected_raw_material(
    attrs,
    *,
    section_label,
    require_dropdown=False,
):
    """
    A material row must come from the dropdown.

    rawMaterialName is saved only as a snapshot/display value.
    rawMaterialName alone is not allowed as manual material entry.
    """

    if not _row_has_any_data(attrs):
        return attrs

    if require_dropdown and not attrs.get("rawMaterialId"):
        raise serializers.ValidationError(
            {
                "rawMaterialId": (
                    f"Select {section_label} from dropdown. "
                    "Manual raw material name is not allowed."
                )
            }
        )

    if attrs.get("usedQtyKg") is None and attrs.get("doseMg") is None:
        raise serializers.ValidationError({"usedQtyKg": "KG used is required."})

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
    mgDoseUsed = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    mgDose = serializers.DecimalField(
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
    labelClaimMg = serializers.DecimalField(
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
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    # Backward-compatible KG aliases.
    kgUsed = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    qtyUsedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgFormula = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgThisMix = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    percentShare = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    ratioPercent = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    qtyBeforeKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        required=False,
        allow_null=True,
    )
    qtyAfterKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        required=False,
        allow_null=True,
    )

    totalUnits = serializers.IntegerField(min_value=0, required=False, allow_null=True)

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        attrs = _sync_category_aliases(attrs)
        attrs = _sync_dose_aliases(attrs)
        attrs = _sync_kg_aliases(attrs)
        attrs = _sync_percent_aliases(attrs)

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
    mgDoseUsed = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    mgDose = serializers.DecimalField(
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
    labelClaimMg = serializers.DecimalField(
        max_digits=14,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    usedQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    kgUsed = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    qtyUsedKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgFormula = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    requiredQtyKgThisMix = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    percentShare = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )
    ratioPercent = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        min_value=0,
        required=False,
        allow_null=True,
    )

    qtyBeforeKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
        required=False,
        allow_null=True,
    )
    qtyAfterKg = serializers.DecimalField(
        max_digits=12,
        decimal_places=6,
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
        attrs = _sync_percent_aliases(attrs)

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


MIXING_LIST_FIELDS = {
    "medicinalIngredients",
    "nonMedicinalIngredients",
    "rmUsage",
    "byBookRawMaterials",
    "pragmaticRawMaterials",
    "nonMedUsage",
    "mixingDates",
    "mixingSessions",
    "mixingTimeLogs",
    "timeLogs",
}

MIXING_MATERIAL_FIELDS = {
    "medicinalIngredients",
    "nonMedicinalIngredients",
    "rmUsage",
    "byBookRawMaterials",
    "pragmaticRawMaterials",
    "nonMedUsage",
}


def _drop_absent_empty_list_defaults(attrs, present_keys):
    if present_keys is None:
        return attrs

    for key in MIXING_LIST_FIELDS:
        if key not in present_keys and attrs.get(key) == []:
            attrs.pop(key, None)

    return attrs


def _sync_mixing_aliases(attrs, *, present_keys=None):
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

    attrs = _drop_absent_empty_list_defaults(attrs, present_keys)

    has_material_payload = (
        present_keys is None
        or any(key in present_keys for key in MIXING_MATERIAL_FIELDS)
    )

    if has_material_payload:
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

    fresh_kg = _first_value(
        attrs,
        "freshMixingRequiredKg",
        "calculatedFreshRawMaterialsTotalKg",
    )
    if fresh_kg is not None:
        attrs["freshMixingRequiredKg"] = fresh_kg
        attrs["calculatedFreshRawMaterialsTotalKg"] = fresh_kg

    if attrs.get("mixedPowderName") is not None:
        attrs["mixedPowderName"] = attrs["mixedPowderName"].strip()

    location = _first_value(attrs, "location", "rackNo")
    if location is not None:
        location = location.strip() if isinstance(location, str) else location
        attrs["location"] = location
        attrs["rackNo"] = location

    for key in (
        "existingMixedPowderId",
        "existingMixedPowderCode",
        "existingMixedPowderSource",
    ):
        if attrs.get(key) is not None:
            attrs[key] = attrs[key].strip()

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
