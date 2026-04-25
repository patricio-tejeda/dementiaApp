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
    # One profile per user. SET_NULL on user delete would orphan data;
    # CASCADE ensures deleting a user also deletes their patient data.
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
        """Count total data points (filled profile fields + diary entries)."""
        filled_fields = self.fields.exclude(answer__exact='').exclude(answer__isnull=True).count()
        diary_count = self.diary_entries.count()
        return filled_fields + diary_count

    def is_complete(self):
        """True when every required profile field has a non-empty answer."""
        required_fields = self.fields.filter(required=True)
        if not required_fields.exists():
            # No fields seeded yet → not complete
            return False
        return not required_fields.filter(answer__in=['', None]).exists()


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
    is_generated = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.title}: {self.answer[:50]}"


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

# maybe create a class/field that allows the user to input a text/voice sample that the LLM can mimic when
# asking questions later, then we can use the similarity evaluation, or we can tell the ai
# to act like a caregiver would in terms of asking questions then evaluate the similarties of the 
# ai personality/used words to that of dementia caregivers