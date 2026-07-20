from apps.manufacturing.serializers.base import _first_value

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

__all__ = [
    "MIXING_LIST_FIELDS",
    "MIXING_MATERIAL_FIELDS",
    "_drop_absent_empty_list_defaults",
    "_list_from_attrs",
    "_sync_mixing_aliases",
]