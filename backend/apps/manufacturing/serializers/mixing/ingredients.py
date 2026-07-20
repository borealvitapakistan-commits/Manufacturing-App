from rest_framework import serializers

from apps.common.serializers import NullableUUIDField
from apps.manufacturing.serializers.base import (
    _has_value,
    _row_has_any_data,
    _sync_category_aliases,
    _sync_dose_aliases,
    _sync_kg_aliases,
    _sync_percent_aliases,
    _validate_selected_raw_material,
)

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

__all__ = [
    "MedicinalIngredientSerializer",
    "NonMedicinalIngredientSerializer",
    "UsageItemSerializer",
]