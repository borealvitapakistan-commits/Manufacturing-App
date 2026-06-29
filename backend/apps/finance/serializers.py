from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


class ExpenseBookSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    currency = serializers.CharField(required=False, default="PKR")
    openingBalanceCurrent = serializers.DecimalField(
        max_digits=14, decimal_places=4, required=False, default=0
    )
    openingAdjustments = serializers.ListField(
        child=serializers.DictField(), required=False, default=list
    )
    tags = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    status = serializers.ChoiceField(choices=["open", "closed"], required=False, default="open")
    isActive = serializers.BooleanField(required=False, default=True)
    hasPendingCarry = serializers.BooleanField(required=False, default=False)
    pendingCarryAmount = serializers.DecimalField(
        max_digits=14, decimal_places=4, required=False, default=0
    )
    carriedToBookId = NullableUUIDField(required=False, allow_null=True)
    closedAt = serializers.DateTimeField(required=False, allow_null=True)


class ExpenseSerializer(serializers.Serializer):
    bookId = serializers.UUIDField()
    date = serializers.IntegerField()
    description = serializers.CharField(allow_blank=False)
    givenFrom = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    givenTo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    direction = serializers.ChoiceField(choices=["debit", "credit"])
    type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, default=list)


class CloseExpenseBookSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(
        choices=["later", "transfer", "new"],
        required=False,
        default="later",
    )
    targetBookId = NullableUUIDField(required=False, allow_null=True)
    newBookName = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    sourceDescription = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )

    def validate(self, attrs):
        mode = attrs.get("mode", "later")
        if mode == "transfer" and not attrs.get("targetBookId"):
            raise serializers.ValidationError(
                {"targetBookId": "A target book is required for transfer mode."}
            )
        return attrs


class PullCarrySerializer(serializers.Serializer):
    targetBookId = serializers.UUIDField()
