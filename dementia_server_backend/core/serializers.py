from rest_framework import serializers
from .models import AppUser
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.contrib.auth.password_validation import validate_password


class AppUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = AppUser
        fields = [
            "id", "username", "password", "full_name",
            "address", "email", "phone_number",
            "birthplace", "elementary_school", "favorite_ice_cream",
        ]

    def validate_password(self, value):
        """
        Run Django password validators 
        """
        try:
            validate_password(value) 
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def create(self, validated_data):
        # Hash the password before saving
        validated_data["password"] = make_password(validated_data["password"])
        return super().create(validated_data)

class AppUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["full_name", "address", "email", "phone_number"]
        extra_kwargs = {
            "email": {"required": True},
        }