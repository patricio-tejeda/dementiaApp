from rest_framework import serializers
from .models import PatientProfile, InputInfoPage, AppUser
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.contrib.auth.password_validation import validate_password


class InputInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = InputInfoPage
        fields = ('id', 'title', 'answer', 'required', 'is_custom', 'order')


class PatientProfileSerializer(serializers.ModelSerializer):
    fields = InputInfoSerializer(many=True)

    class Meta:
        model = PatientProfile
        fields = ('id', 'created_at', 'updated_at', 'fields')

    def create(self, validated_data):
        fields_data = validated_data.pop('fields')
        profile = PatientProfile.objects.create(**validated_data)
        for field_data in fields_data:
            InputInfoPage.objects.create(profile=profile, **field_data)
        return profile

    def update(self, instance, validated_data):
        fields_data = validated_data.pop('fields', [])
        for field_data in fields_data:
            field_id = field_data.get('id', None)
            if field_id:
                InputInfoPage.objects.filter(id=field_id, profile=instance).update(**field_data)
            else:
                InputInfoPage.objects.create(profile=instance, **field_data)
        return instance


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
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def create(self, validated_data):
        validated_data["password"] = make_password(validated_data["password"])
        return super().create(validated_data)


class AppUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["full_name", "address", "email", "phone_number"]
        extra_kwargs = {
            "email": {"required": True},
        }