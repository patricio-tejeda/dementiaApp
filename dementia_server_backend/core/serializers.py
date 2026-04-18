from rest_framework import serializers
from .models import PatientProfile, InputInfoPage, DiaryEntry, GeneratedQuestion, QuestionAttempt, AppUser
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.contrib.auth.password_validation import validate_password


class InputInfoSerializer(serializers.ModelSerializer):
    # id is writable so PatientProfile update() can match existing rows
    id = serializers.IntegerField(required=False)

    class Meta:
        model = InputInfoPage
        fields = ('id', 'title', 'answer', 'required', 'is_custom', 'order')


class PatientProfileSerializer(serializers.ModelSerializer):
    fields = InputInfoSerializer(many=True)

    class Meta:
        model = PatientProfile
        fields = ('id', 'created_at', 'updated_at', 'fields')

    def create(self, validated_data):
        fields_data = validated_data.pop('fields', [])
        profile = PatientProfile.objects.create(**validated_data)
        for field_data in fields_data:
            field_data.pop('id', None)  # ignore client-supplied id on create
            InputInfoPage.objects.create(profile=profile, **field_data)
        return profile

    def update(self, instance, validated_data):
        fields_data = validated_data.pop('fields', [])
        for field_data in fields_data:
            field_id = field_data.pop('id', None)
            if field_id:
                InputInfoPage.objects.filter(
                    id=field_id, profile=instance
                ).update(**field_data)
            else:
                InputInfoPage.objects.create(profile=instance, **field_data)
        return instance


class DiaryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = DiaryEntry
        fields = (
            'id', 'profile', 'text', 'date', 'created_at',
            'quality', 'followup_prompt', 'enrichment',
        )
        read_only_fields = ('date', 'created_at', 'quality', 'followup_prompt')

    def create(self, validated_data):
        """Classify the entry on save so we don't re-classify on every generate."""
        entry = super().create(validated_data)
        try:
            from RAG.diary_classifier import classify_diary_entry
            result = classify_diary_entry(entry.text)
            entry.quality = result["quality"]
            entry.followup_prompt = result["followup_prompt"]
            entry.save(update_fields=["quality", "followup_prompt"])
        except Exception as e:
            print(f"[WARN] Diary classification failed on save: {e}")
        return entry


class GeneratedQuestionSerializer(serializers.ModelSerializer):
    times_asked = serializers.SerializerMethodField()
    times_correct = serializers.SerializerMethodField()
    times_wrong = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedQuestion
        fields = (
            'id', 'profile', 'question_text', 'options', 'correct_answer',
            'category', 'question_type', 'source_diary_entry',
            'created_at', 'times_asked', 'times_correct', 'times_wrong',
        )
        read_only_fields = ('created_at',)

    def get_times_asked(self, obj):
        return obj.times_asked()

    def get_times_correct(self, obj):
        return obj.times_correct()

    def get_times_wrong(self, obj):
        return obj.times_wrong()


class QuestionAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionAttempt
        fields = ('id', 'question', 'selected_answer', 'is_correct', 'created_at')
        read_only_fields = ('is_correct', 'created_at')

    def create(self, validated_data):
        question = validated_data['question']
        selected = validated_data['selected_answer']

        if question.question_type == "free_recall":
            validated_data['is_correct'] = True
            if question.source_diary_entry:
                question.source_diary_entry.enrichment = selected
                question.source_diary_entry.save(update_fields=["enrichment"])
        else:
            validated_data['is_correct'] = (selected == question.correct_answer)

        return super().create(validated_data)


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