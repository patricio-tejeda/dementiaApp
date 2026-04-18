from rest_framework import viewsets, generics, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
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

        # Rebuild FAISS index
        from RAG.data_loader import process_all_sql
        from RAG.vector_database import VectorStore
        docs = process_all_sql('.')
        store = VectorStore('faiss_store')
        store.build_from_document(docs)

        existing = GeneratedQuestion.objects.filter(profile=profile).count()
        cap = profile.data_point_count()
        needed = cap - existing

        if needed <= 0:
            return Response({
                "message": f"Already have {existing} questions (cap is {cap} based on your data). No new ones generated.",
                "total": existing,
                "cap": cap,
            })

        from RAG.question_generator import generate_questions_for_profile
        new_questions = generate_questions_for_profile(profile, count=needed)

        return Response({
            "message": f"Generated {len(new_questions)} new questions.",
            "total": existing + len(new_questions),
            "cap": cap,
            "questions": GeneratedQuestionSerializer(new_questions, many=True).data,
        })

    @action(detail=False, methods=['get'])
    def adaptive(self, request):
        """GET /api/questions/adaptive/?count=5 — weighted question selection."""
        count = int(request.query_params.get('count', 5))

        questions = GeneratedQuestion.objects.filter(profile__user=request.user)
        if not questions.exists():
            return Response({"error": "No questions available. Generate some first."}, status=404)

        scored = []
        for q in questions:
            total = q.times_asked()
            wrong = q.times_wrong()
            if total == 0:
                score = 10
            else:
                score = 1 + (wrong / total) * 9
            scored.append((score, q))

        scored.sort(key=lambda x: x[0], reverse=True)
        selected = [q for _, q in scored[:count]]

        return Response(GeneratedQuestionSerializer(selected, many=True).data)


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