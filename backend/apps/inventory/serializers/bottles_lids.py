from rest_framework import serializers


BOTTLE_TYPES = ("capsule", "jar")
CAPSULE_TYPES = ("200", "250", "300")


class BottleLidSerializer(serializers.Serializer):
    bottleType = serializers.ChoiceField(choices=BOTTLE_TYPES)
    capsuleType = serializers.ChoiceField(
        choices=CAPSULE_TYPES,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    quantity = serializers.IntegerField(min_value=0)

    def validate(self, attrs):
        bottle_type = attrs.get("bottleType")
        capsule_type = attrs.get("capsuleType")

        if bottle_type == "capsule" and not capsule_type:
            raise serializers.ValidationError(
                {"capsuleType": "Bottle size is required when bottle type is capsule."}
            )
        if bottle_type == "jar":
            attrs["capsuleType"] = None
        return attrs
