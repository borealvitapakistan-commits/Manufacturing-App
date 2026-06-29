from decimal import Decimal

from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


VENDOR_CATEGORIES = [
    "raw_material_supplier",
    "bottles_jars",
    "lid_supplier",
    "label_supplier",
    "printer",
    "printing_vendor",
    "machine",
    "logistic",
]


class CompanySettingsSerializer(serializers.Serializer):
    companyName = serializers.CharField(required=False, allow_blank=True, default="")
    addressLine1 = serializers.CharField(required=False, allow_blank=True, default="")
    addressLine2 = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    city = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    province = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    country = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    logoUrl = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class VendorSerializer(serializers.Serializer):
    name = serializers.CharField()
    shortCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    vendorCode = serializers.CharField()
    categories = serializers.ListField(
        child=serializers.ChoiceField(choices=VENDOR_CATEGORIES),
        required=False,
        default=list,
    )
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    whatsapp = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    whatsappSameAsPhone = serializers.BooleanField(required=False, default=True)
    country = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    city = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    website = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    paymentTerms = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)

    def validate_vendorCode(self, value):
        value = value.strip()
        if not value.isdigit():
            raise serializers.ValidationError(
                "Vendor PO prefix must be numeric, like 25 or 26."
            )
        return value

    def validate_categories(self, value):
        if not value:
            raise serializers.ValidationError("Select at least one vendor category.")
        return value


class PurchaseOrderSerializer(serializers.Serializer):
    vendorId = serializers.UUIDField()
    orderType = serializers.ChoiceField(
        choices=["raw_material", "label", "product", "bottles_lids"]
    )
    status = serializers.ChoiceField(
        choices=["given", "working", "sent", "received", "canceled"],
        required=False,
        default="given",
    )
    itemName = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=Decimal("0.0001")
    )
    unit = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    unitPrice = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=0, required=False, allow_null=True
    )
    brandId = NullableUUIDField(required=False, allow_null=True)
    productId = NullableUUIDField(required=False, allow_null=True)
    rawMaterialId = NullableUUIDField(required=False, allow_null=True)
    labelInventoryId = NullableUUIDField(required=False, allow_null=True)
    labelName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    expectedDate = serializers.DateField(required=False, allow_null=True)
    receivedDate = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class PODocumentItemSerializer(serializers.Serializer):
    sr = serializers.IntegerField(min_value=1)
    orderType = serializers.ChoiceField(
        choices=["raw_material", "label", "product", "bottles_lids", "custom"]
    )
    itemId = NullableUUIDField(required=False, allow_null=True)
    itemName = serializers.CharField(allow_blank=True)
    quantity = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=0)
    unitPrice = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=0, required=False, allow_null=True
    )


class PODocumentSerializer(serializers.Serializer):
    vendorId = NullableUUIDField(required=False, allow_null=True)
    vendorName = serializers.CharField(required=False, allow_blank=True)
    vendorAddress = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    shipToName = serializers.CharField(required=False, allow_blank=True)
    shipToAddress = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    shipToPhone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    brandId = NullableUUIDField(required=False, allow_null=True)
    poDate = serializers.DateField(required=False)
    termsConditions = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(
        choices=["draft", "sent", "received", "canceled"],
        required=False,
        default="draft",
    )
    items = PODocumentItemSerializer(many=True, required=False)
