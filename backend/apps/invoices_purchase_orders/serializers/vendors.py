from rest_framework import serializers

VENDOR_CATEGORIES = [
    "raw_material_supplier",
    "bottles_jars",
    "lid_supplier",
    "label_supplier",
    "logistic",
    "manufacturer",
    "shop",
]


class VendorSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    vendorCode = serializers.CharField(max_length=50)
    shortCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categories = serializers.ListField(
        child=serializers.ChoiceField(choices=VENDOR_CATEGORIES),
        required=False,
        default=list,
    )
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    email = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    whatsapp = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    country = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    city = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    website = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    paymentTerms = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)

__all__ = ["VendorSerializer", "VENDOR_CATEGORIES"]
