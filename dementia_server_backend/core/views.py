from rest_framework import viewsets, generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
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


class PatientProfileView(viewsets.ModelViewSet):
    serializer_class = PatientProfileSerializer
    queryset = PatientProfile.objects.all()
    permission_classes = [permissions.AllowAny]


class InputInfoPageView(viewsets.ModelViewSet):
    serializer_class = InputInfoSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        profile_id = self.request.query_params.get('profile', None)
        if profile_id:
            return InputInfoPage.objects.filter(profile_id=profile_id)
        return InputInfoPage.objects.all()


class DiaryEntryView(viewsets.ModelViewSet):
    serializer_class = DiaryEntrySerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        profile_id = self.request.query_params.get('profile', None)
        if profile_id:
            return DiaryEntry.objects.filter(profile_id=profile_id)
        return DiaryEntry.objects.all()


class GeneratedQuestionView(viewsets.ModelViewSet):
    serializer_class = GeneratedQuestionSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        profile_id = self.request.query_params.get('profile', None)
        category = self.request.query_params.get('category', None)
        qs = GeneratedQuestion.objects.all()
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        if category:
            qs = qs.filter(category=category)
        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """POST /api/questions/generate/ — rebuild FAISS and generate questions up to the data-point cap."""
        profile_id = request.data.get('profile_id')

        if not profile_id:
            return Response({"error": "profile_id is required"}, status=400)

        try:
            profile = PatientProfile.objects.get(id=profile_id)
        except PatientProfile.DoesNotExist:
            return Response({"error": "Profile not found"}, status=404)

        # Rebuild FAISS index with latest data
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
        """GET /api/questions/adaptive/?profile=1&count=5 — weighted question selection."""
        profile_id = request.query_params.get('profile', None)
        count = int(request.query_params.get('count', 5))

        if not profile_id:
            return Response({"error": "profile query param is required"}, status=400)

        questions = GeneratedQuestion.objects.filter(profile_id=profile_id)
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


class QuestionAttemptView(viewsets.ModelViewSet):
    serializer_class = QuestionAttemptSerializer
    permission_classes = [permissions.AllowAny]
    queryset = QuestionAttempt.objects.all()


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
    """GET /api/users/<id>/"""
    serializer_class = AppUserSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = AppUser.objects.all()

    def get_object(self):
        user_id = self.kwargs.get("id")
        return generics.get_object_or_404(AppUser, id=user_id)