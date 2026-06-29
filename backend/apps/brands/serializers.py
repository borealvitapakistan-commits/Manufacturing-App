from rest_framework import serializers


class BrandSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    codePrefix = serializers.CharField(max_length=50)
    shortName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    addressLine1 = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    addressLine2 = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    city = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    province = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    country = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    color = serializers.CharField(required=False, default="#16a34a")
    # The old UI stores uploaded logos as data URLs as well as normal URLs.
    logoUrl = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)
