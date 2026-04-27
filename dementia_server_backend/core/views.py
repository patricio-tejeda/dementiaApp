from rest_framework import viewsets, generics, permissions, status
from rest_framework.decorators import action
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
)
from .models import PatientProfile, InputInfoPage, DiaryEntry, GeneratedQuestion, QuestionAttempt, AppUser
from RAG.groq_client import MissingGroqAPIKeyError
from .question_sessions import build_question_session, desired_question_bank_size, ensure_question_bank
from .profile_question_generator import generate_profile_followup_questions


# ------------------------------------------------------------------
# Helper: seed the 16 required profile fields on first profile create
# ------------------------------------------------------------------
DEFAULT_PROFILE_FIELDS = [
    ("Patient Name", True),
    ("Date of Birth", True),
    ("Hometown", True),
    ("Current City", True),
    ("Mother's Name", True),
    ("Father's Name", True),
    ("Number of Siblings", True),
    ("Spouse's Name", False),
    ("Number of Children", False),
    ("Elementary School", True),
    ("High School", True),
    ("College", False),
    ("Degree", False),
    ("Occupation", True),
    ("Favorite Color", False),
    ("Favorite Food", False),
]


def seed_profile_fields(profile):
    """Create the default fields for a brand-new profile."""
    for order, (title, required) in enumerate(DEFAULT_PROFILE_FIELDS):
        InputInfoPage.objects.create(
            profile=profile,
            title=title,
            required=required,
            order=order,
        )


from django.db import transaction

def get_or_create_profile(user):
    """Fetch the user's PatientProfile, creating it (with seeded fields) if missing.
    Idempotent: safe against concurrent calls (React StrictMode double-renders).
    """
    with transaction.atomic():
        profile, _ = PatientProfile.objects.get_or_create(user=user)
        # Only seed if fields haven't been seeded yet (idempotent).
        if not profile.fields.exists():
            seed_profile_fields(profile)
    return profile


# ------------------------------------------------------------------
# Profile
# ------------------------------------------------------------------
class PatientProfileView(viewsets.ModelViewSet):
    """
    CRUD for the logged-in user's PatientProfile only.
    Listing always returns exactly one profile (the user's own).
    """
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
    """
    GET /api/me/profile/
    Returns the logged-in user's profile, auto-creating it (with seeded fields)
    on first call. Response includes `is_complete` so the frontend can gate
    on setup completion.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = get_or_create_profile(request.user)
        data = PatientProfileSerializer(profile).data
        data["is_complete"] = profile.is_complete()
        return Response(data)


# ------------------------------------------------------------------
# Input fields
# ------------------------------------------------------------------
class InputInfoPageView(viewsets.ModelViewSet):
    serializer_class = InputInfoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only fields belonging to the logged-in user's profile
        return InputInfoPage.objects.filter(profile__user=self.request.user)

    def perform_create(self, serializer):
        profile = get_or_create_profile(self.request.user)
        serializer.save(profile=profile)


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
        """POST /api/questions/generate/ — rebuild FAISS and generate questions."""
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
        """GET /api/questions/adaptive/?count=5 — weighted question selection."""
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
        """GET /api/questions/session/?mode=practice|adaptive&count=10 — fresh game session."""
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
        """
        POST /api/questions/<id>/record_reprompt/
        Increments reprompt_count and stores when the reprompt was scheduled.
        """
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


# ------------------------------------------------------------------
# Attempts
# ------------------------------------------------------------------
class QuestionAttemptView(viewsets.ModelViewSet):
    serializer_class = QuestionAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return QuestionAttempt.objects.filter(question__profile__user=self.request.user)


# ------------------------------------------------------------------
# Users
# ------------------------------------------------------------------
class AppUserCreateAPIView(generics.CreateAPIView):
    """Register a new user, no auth required."""
    queryset = AppUser.objects.all()
    serializer_class = AppUserSerializer
    permission_classes = [permissions.AllowAny]


class AppUserDetailUpdateView(generics.RetrieveUpdateAPIView):
    """GET/PUT/PATCH /me/ — current logged-in user."""
    serializer_class = AppUserUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class AppUserDetailByIdView(generics.RetrieveAPIView):
    """GET /api/users/<id>/ — only return the logged-in user's own record."""
    serializer_class = AppUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # Only allow fetching your own record to prevent user enumeration
        user_id = self.kwargs.get("id")
        if user_id != self.request.user.id:
            from django.http import Http404
            raise Http404("Not found.")
        return self.request.user
