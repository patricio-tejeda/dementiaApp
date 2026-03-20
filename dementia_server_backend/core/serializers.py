from rest_framework import serializers
from .models import PatientProfile, InputInfoPage

class InputInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = InputInfoPage
        fields = ('id', 'title', 'answer', 'required', 'is_custom', 'order')

class PatientProfileSerializer(serializers.ModelSerializer):
    fields = InputInfoSerializer(many=True)
    class Meta:
        model = PatientProfile
        fields = ('id', 'caregiver', 'created_at', 'updated_at', 'fields')
        read_only = ('caregiver')

    def create(self, validated_data):
        fields_data = validated_data.pop('fields')
        profile = PatientProfile.objects.create(**validated_data)
        for field_data in fields_data:
            InputInfoPage.objects.create(profile=profile, **field_data)
        return profile

    def update(self, instance, validated_data):
        fields_data = validated_data.pop('fields', [])
        # Update or create each field by id
        for field_data in fields_data:
            field_id = field_data.get('id', None)
            if field_id:
                InputInfoPage.objects.filter(id=field_id, profile=instance).update(**field_data)
            else:
                InputInfoPage.objects.create(profile=instance, **field_data)
        return instance
