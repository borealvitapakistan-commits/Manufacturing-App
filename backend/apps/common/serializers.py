from rest_framework import serializers


class NullableUUIDField(serializers.UUIDField):
    """Accept the empty-string values produced by copied HTML select controls."""

    def to_internal_value(self, data):
        if data == "" or data is None:
            return None
        return super().to_internal_value(data)


class OpenPayloadSerializer(serializers.Serializer):
    """Accept a JSON object while leaving schema enforcement to PostgreSQL."""

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected a JSON object.")
        return dict(data)


class StockAdjustmentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    adjustment = serializers.DecimalField(max_digits=12, decimal_places=4)


class StockLevelSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        min_value=0,
    )


class ManualInventoryAdjustmentSerializer(serializers.Serializer):
    finishedGoodId = serializers.UUIDField()
    changes = serializers.DictField()
    reason = serializers.CharField()
