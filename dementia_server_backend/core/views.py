from rest_framework import viewsets, generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import (
    PatientProfileSerializer,
    InputInfoSerializer,
    DiaryEntrySerializer,
    GeneratedQuestionSerializer,
    AppUserSerializer,
    AppUserUpdateSerializer,
)
from .models import PatientProfile, InputInfoPage, DiaryEntry, GeneratedQuestion, AppUser


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
        """POST /api/questions/generate/ — generate questions for a profile."""
        profile_id = request.data.get('profile_id')
        count = int(request.data.get('count', 5))

        if not profile_id:
            return Response({"error": "profile_id is required"}, status=400)

        try:
            profile = PatientProfile.objects.get(id=profile_id)
        except PatientProfile.DoesNotExist:
            return Response({"error": "Profile not found"}, status=404)

        # Check how many questions already exist
        existing = GeneratedQuestion.objects.filter(profile=profile).count()
        needed = count - existing
        if needed <= 0:
            return Response({
                "message": f"Already have {existing} questions. No new ones generated.",
                "total": existing,
            })

        # Generate questions via RAG
        from RAG.question_generator import generate_questions_for_profile
        new_questions = generate_questions_for_profile(profile, count=needed)

        return Response({
            "message": f"Generated {len(new_questions)} new questions.",
            "total": existing + len(new_questions),
            "questions": GeneratedQuestionSerializer(new_questions, many=True).data,
        })


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