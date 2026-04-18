import uuid
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models


class PatientProfile(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        name_field = self.fields.filter(title__iexact="Patient Name").first()
        return name_field.answer if name_field else f"Profile #{self.id}"


class InputInfoPage(models.Model):
    profile = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="fields",
        null=True,
        blank=True)

    title = models.CharField(max_length=120)
    answer = models.TextField(blank=True)
    required = models.BooleanField(default=False)
    is_custom = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.title}: {self.answer[:50]}"


class DiaryEntry(models.Model):
    profile = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="diary_entries"
    )
    text = models.TextField()
    date = models.DateField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.date}: {self.text[:60]}"


class AIquestions(models.Model):
    profile = models.OneToOneField(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="ai_interview"
    )


class AppUser(AbstractUser):
    unique_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    full_name = models.CharField(max_length=255)
    address = models.TextField()
    phone_regex = RegexValidator(
        regex=r'^\+?1?\d{9,15}$',
        message="Phone number must be entered in the format: '+999999999'. Up to 15 digits allowed."
    )
    phone_number = models.CharField(validators=[phone_regex], max_length=17)

    birthplace = models.CharField(max_length=255)
    elementary_school = models.CharField(max_length=255)
    favorite_ice_cream = models.CharField(max_length=255)

    def __str__(self):
        return self.username