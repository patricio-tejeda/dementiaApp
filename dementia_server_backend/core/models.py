import uuid
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models


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


class PatientProfile(models.Model):
    user = models.OneToOneField(
        AppUser,
        on_delete=models.CASCADE,
        related_name="patient_profile",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        name_field = self.fields.filter(title__iexact="Patient Name").first()
        return name_field.answer if name_field else f"Profile #{self.id}"

    def data_point_count(self):
        filled_fields = self.fields.exclude(answer__exact='').exclude(answer__isnull=True).count()
        diary_count = self.diary_entries.count()
        return filled_fields + diary_count

    def is_complete(self):
        required_fields = self.fields.filter(required=True)
        if not required_fields.exists():
            return False
        return not required_fields.filter(answer__in=['', None]).exists()


class InputInfoPage(models.Model):
    CATEGORY_CHOICES = [
        ("personal", "Personal Info"),
        ("family", "Family Info"),
        ("custom", "Custom"),
    ]

    profile = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="fields",
        null=True,
        blank=True)

    title = models.CharField(max_length=120)
    answer = models.TextField(blank=True)
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default="personal",
    )
    required = models.BooleanField(default=False)
    is_custom = models.BooleanField(default=False)
    is_generated = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.title}: {self.answer[:50]}"


def voiceline_upload_path(instance, filename):
    """Store voicelines under media/voicelines/<profile_id>/<field_id>_<uuid><ext>"""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "webm"
    new_name = f"{instance.field.id}_{uuid.uuid4().hex[:8]}.{ext}"
    profile_id = instance.field.profile_id if instance.field.profile_id else "orphan"
    return f"voicelines/{profile_id}/{new_name}"


class Voiceline(models.Model):
    """An audio recording attached to a specific InputInfoPage field (family member)."""
    field = models.OneToOneField(
        InputInfoPage,
        on_delete=models.CASCADE,
        related_name="voiceline",
    )
    audio = models.FileField(upload_to=voiceline_upload_path)
    label = models.CharField(max_length=120, blank=True)  # optional, e.g. "Mom's birthday message"
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Voiceline for field #{self.field_id}"


class DiaryEntry(models.Model):
    QUALITY_CHOICES = [
        ("low", "Low quality / discard"),
        ("sparse", "Sparse - needs follow-up"),
        ("rich", "Rich - usable for MCQ"),
    ]

    profile = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="diary_entries"
    )
    text = models.TextField()
    date = models.DateField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    quality = models.CharField(
        max_length=10,
        choices=QUALITY_CHOICES,
        null=True,
        blank=True,
    )
    followup_prompt = models.TextField(null=True, blank=True)
    enrichment = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.date}: {self.text[:60]}"


class GeneratedQuestion(models.Model):
    CATEGORY_CHOICES = [
        ("personal", "Personal Info"),
        ("family", "Family"),
        ("education", "Education"),
        ("diary", "Diary / Recent Events"),
    ]

    QUESTION_TYPE_CHOICES = [
        ("mcq", "Multiple Choice"),
        ("free_recall", "Free Recall"),
    ]

    profile = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="generated_questions"
    )
    question_text = models.TextField()
    options = models.JSONField(null=True, blank=True)
    correct_answer = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="personal")
    question_type = models.CharField(
        max_length=15,
        choices=QUESTION_TYPE_CHOICES,
        default="mcq",
    )
    source_diary_entry = models.ForeignKey(
        DiaryEntry,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="generated_questions",
    )
    reprompt_count = models.PositiveIntegerField(default=0)
    last_reprompted_at = models.DateTimeField(null=True, blank=True)
    tone_score = models.PositiveSmallIntegerField(null=True, blank=True)
    tone_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.question_text[:60]}"

    def times_asked(self):
        return self.attempts.count()

    def times_correct(self):
        return self.attempts.filter(is_correct=True).count()

    def times_wrong(self):
        return self.attempts.filter(is_correct=False).count()

    def accuracy(self):
        total = self.times_asked()
        if total == 0:
            return None
        return self.times_correct() / total


class QuestionAttempt(models.Model):
    question = models.ForeignKey(
        GeneratedQuestion,
        on_delete=models.CASCADE,
        related_name="attempts"
    )
    selected_answer = models.CharField(max_length=255)
    is_correct = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{'OK' if self.is_correct else 'X'} {self.question.question_text[:40]}"


class AIquestions(models.Model):
    profile = models.OneToOneField(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="ai_interview"
    )