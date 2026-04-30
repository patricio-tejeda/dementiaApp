from rest_framework import viewsets, generics, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import F
from django.utils import timezone
from .serializers import (
    PatientProfileSerializer,
    InputInfoSerializer,
    DiaryEntrySerializer,
    GeneratedQuestionSerializer,
    QuestionAttemptSerializer,
    AppUserSerializer,
    AppUserUpdateSerializer,
    VoicelineSerializer,
)
from .models import (
    PatientProfile, InputInfoPage, DiaryEntry,
    GeneratedQuestion, QuestionAttempt, AppUser, Voiceline,
)
from RAG.groq_client import MissingGroqAPIKeyError
from .question_sessions import build_question_session, desired_question_bank_size, ensure_question_bank
from .profile_question_generator import generate_profile_followup_questions


# ------------------------------------------------------------------
# Helper: seed the 16 required profile fields on first profile create
# ------------------------------------------------------------------
DEFAULT_PROFILE_FIELDS = [
    # (title, required, category)
    ("Patient Name", True, "personal"),
    ("Date of Birth", True, "personal"),
    ("Hometown", True, "personal"),
    ("Current City", True, "personal"),
    ("Mother's Name", True, "family"),
    ("Father's Name", True, "family"),
    ("Number of Siblings", True, "family"),
    ("Spouse's Name", False, "family"),
    ("Number of Children", False, "family"),
    ("Elementary School", True, "personal"),
    ("High School", True, "personal"),
    ("College", False, "personal"),
    ("Degree", False, "personal"),
    ("Occupation", True, "personal"),
    ("Favorite Color", False, "personal"),
    ("Favorite Food", False, "personal"),
]


def seed_profile_fields(profile):
    """Create the default fields for a brand-new profile."""
    for order, (title, required, category) in enumerate(DEFAULT_PROFILE_FIELDS):
        InputInfoPage.objects.create(
            profile=profile,
            title=title,
            required=required,
            category=category,
            order=order,
        )


from django.db import transaction

def get_or_create_profile(user):
    """Fetch the user's PatientProfile, creating it (with seeded fields) if missing.
    Idempotent: safe against concurrent calls (React StrictMode double-renders).
    """
    with transaction.atomic():
        profile, _ = PatientProfile.objects.get_or_create(user=user)
        if not profile.fields.exists():
            seed_profile_fields(profile)
    return profile


# ------------------------------------------------------------------
# Profile
# ------------------------------------------------------------------
class PatientProfileView(viewsets.ModelViewSet):
    serializer_class = PatientProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return PatientProfile.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def generate_followups(self, request, pk=None):
        """POST /api/profiles/<id>/generate_followups/ - AI-generated profile prompts."""
        profile = self.get_object()
        count = int(request.data.get("count", 5))
        count = max(1, min(count, 10))

        try:
            questions = generate_profile_followup_questions(profile, count=count)
        except MissingGroqAPIKeyError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"error": f"Failed to generate follow-up questions: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"questions": questions}, status=status.HTTP_200_OK)


class MyProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = get_or_create_profile(request.user)
        data = PatientProfileSerializer(profile, context={"request": request}).data
        data["is_complete"] = profile.is_complete()
        return Response(data)


# ------------------------------------------------------------------
# Input fields
# ------------------------------------------------------------------
class InputInfoPageView(viewsets.ModelViewSet):
    serializer_class = InputInfoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = InputInfoPage.objects.filter(profile__user=self.request.user)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        profile = get_or_create_profile(self.request.user)
        serializer.save(profile=profile)


# ------------------------------------------------------------------
# Voicelines
# ------------------------------------------------------------------
class VoicelineView(viewsets.ModelViewSet):
    """
    Upload, list, replace, and delete voicelines attached to family fields.

    POST /api/voicelines/  (multipart: field=<id>, audio=<file>, label=<optional>)
       — if a voiceline already exists for that field, it's replaced.
    GET  /api/voicelines/?field=<id>
    DELETE /api/voicelines/<id>/
    """
    serializer_class = VoicelineSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Voiceline.objects.filter(field__profile__user=self.request.user)
        field_id = self.request.query_params.get("field")
        if field_id:
            qs = qs.filter(field_id=field_id)
        return qs

    def create(self, request, *args, **kwargs):
        field_id = request.data.get("field")
        if not field_id:
            return Response({"error": "field id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Make sure the field belongs to the logged-in user
        try:
            field = InputInfoPage.objects.get(id=field_id, profile__user=request.user)
        except InputInfoPage.DoesNotExist:
            return Response({"error": "field not found"}, status=status.HTTP_404_NOT_FOUND)

        if field.category != "family":
            return Response(
                {"error": "Voicelines are only allowed on family fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audio = request.FILES.get("audio")
        if not audio:
            return Response({"error": "audio file is required"}, status=status.HTTP_400_BAD_REQUEST)

        label = request.data.get("label", "")

        # If one already exists, replace the file (and delete the old one from disk)
        existing = Voiceline.objects.filter(field=field).first()
        if existing:
            existing.audio.delete(save=False)
            existing.audio = audio
            existing.label = label
            existing.save()
            serializer = self.get_serializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        voiceline = Voiceline.objects.create(field=field, audio=audio, label=label)
        serializer = self.get_serializer(voiceline)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        # Remove the file from disk too
        if instance.audio:
            instance.audio.delete(save=False)
        instance.delete()


# ------------------------------------------------------------------
# Diary
# ------------------------------------------------------------------
class DiaryEntryView(viewsets.ModelViewSet):
    serializer_class = DiaryEntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return DiaryEntry.objects.filter(profile__user=self.request.user)

    def perform_create(self, serializer):
        profile = get_or_create_profile(self.request.user)
        serializer.save(profile=profile)


# ------------------------------------------------------------------
# Questions
# ------------------------------------------------------------------
class GeneratedQuestionView(viewsets.ModelViewSet):
    serializer_class = GeneratedQuestionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        category = self.request.query_params.get('category', None)
        qs = GeneratedQuestion.objects.filter(profile__user=self.request.user)
        if category:
            qs = qs.filter(category=category)
        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        profile = get_or_create_profile(request.user)
        desired_total = int(request.data.get("desired_total") or desired_question_bank_size(profile))
        rebuild_store = bool(request.data.get("rebuild_store", False))
        existing = GeneratedQuestion.objects.filter(profile=profile).count()

        try:
            total_questions = ensure_question_bank(
                profile,
                desired_total=desired_total,
                rebuild_store=rebuild_store,
            )
        except MissingGroqAPIKeyError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            "message": (
                f"Question bank ready with {total_questions} questions."
                if total_questions > existing
                else f"Question bank already had {total_questions} questions."
            ),
            "total": total_questions,
            "target": desired_total,
        })

    @action(detail=False, methods=['get'])
    def adaptive(self, request):
        profile = get_or_create_profile(request.user)
        count = int(request.query_params.get("count", 8))

        try:
            session_questions = build_question_session(
                profile,
                mode="adaptive",
                count=count,
                ensure_bank=False,
            )
        except MissingGroqAPIKeyError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not session_questions:
            return Response({"error": "No questions available. Generate some first."}, status=404)

        return Response(session_questions)

    @action(detail=False, methods=['get'])
    def session(self, request):
        profile = get_or_create_profile(request.user)
        mode = request.query_params.get("mode", "practice")
        count = int(request.query_params.get("count", 10))

        try:
            session_questions = build_question_session(
                profile,
                mode=mode,
                count=count,
                ensure_bank=False,
            )
        except MissingGroqAPIKeyError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not session_questions:
            return Response({"error": "No questions available. Generate some first."}, status=404)

        return Response(session_questions)

    @action(detail=True, methods=['post'])
    def record_reprompt(self, request, pk=None):
        question = self.get_object()
        question.reprompt_count = F("reprompt_count") + 1
        question.last_reprompted_at = timezone.now()
        question.save(update_fields=["reprompt_count", "last_reprompted_at"])
        question.refresh_from_db(fields=["id", "reprompt_count", "last_reprompted_at"])
        return Response({
            "id": question.id,
            "reprompt_count": question.reprompt_count,
            "last_reprompted_at": question.last_reprompted_at,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def submit_answer(self, request, pk=None):
        question = self.get_object()
        user_answer = request.data.get("answer")

        is_correct = (user_answer == question.correct_answer)

        QuestionAttempt.objects.create(
            question=question,
            user=request.user,
            answer=user_answer,
            is_correct=is_correct
        )

        if not is_correct:
            question.reprompt_count += 1
            question.last_reprompted_at = timezone.now()
            question.save()

        return Response({
            "correct": is_correct,
            "correct_answer": question.correct_answer
        })

# ------------------------------------------------------------------
# Attempts
# ------------------------------------------------------------------
class QuestionAttemptView(viewsets.ModelViewSet):
    serializer_class = QuestionAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return QuestionAttempt.objects.filter(question__profile__user=self.request.user)


# ------------------------------------------------------------------
# Wellness prompts
# ------------------------------------------------------------------
class WellnessPromptsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from RAG.wellness_generator import generate_wellness_prompts

        profile = get_or_create_profile(request.user)
        count = int(request.query_params.get("count", 30))
        count = max(5, min(count, 50))

        personal_fields = list(
            InputInfoPage.objects.filter(profile=profile, category="personal").values("title", "answer")
        )
        family_fields = list(
            InputInfoPage.objects.filter(profile=profile, category="family").values("title", "answer")
        )
        diary_entries = list(
            DiaryEntry.objects.filter(profile=profile).values("text", "quality")
        )

        try:
            prompts = generate_wellness_prompts(
                personal_fields=personal_fields,
                family_fields=family_fields,
                diary_entries=diary_entries,
                count=count,
            )
        except MissingGroqAPIKeyError as exc:
            return Response({"error": str(exc), "prompts": []}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({"prompts": prompts})


# ------------------------------------------------------------------
# Users
# ------------------------------------------------------------------
class AppUserCreateAPIView(generics.CreateAPIView):
    queryset = AppUser.objects.all()
    serializer_class = AppUserSerializer
    permission_classes = [permissions.AllowAny]


class AppUserDetailUpdateView(generics.RetrieveUpdateAPIView):
    serializer_class = AppUserUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class AppUserDetailByIdView(generics.RetrieveAPIView):
    serializer_class = AppUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        user_id = self.kwargs.get("id")
        if user_id != self.request.user.id:
            from django.http import Http404
            raise Http404("Not found.")
        return self.request.user