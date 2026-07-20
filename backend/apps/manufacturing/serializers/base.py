"""Serializers for active manufacturing traceability entities."""

from rest_framework import serializers


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

class MixingSessionSerializer(serializers.Serializer):
    date = serializers.IntegerField(required=False, allow_null=True)

    startDate = serializers.IntegerField(required=False, allow_null=True)
    startTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    endDate = serializers.IntegerField(required=False, allow_null=True)
    endTime = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

__all__ = ["MixingSessionSerializer"]
