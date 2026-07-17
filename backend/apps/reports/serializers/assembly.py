from rest_framework import serializers


class AssemblyReportQuerySerializer(serializers.Serializer):
    brandId = serializers.CharField(required=False, allow_blank=True)
    productId = serializers.CharField(required=False, allow_blank=True)
    njpId = serializers.CharField(required=False, allow_blank=True)
    search = serializers.CharField(required=False, allow_blank=True)
    fromDate = serializers.DateField(required=False)
    toDate = serializers.DateField(required=False)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=1000, default=500)
