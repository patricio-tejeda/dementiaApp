from rest_framework import viewsets, generics, permissions
from .serializers import (
    PatientProfileSerializer,
    InputInfoSerializer,
    DiaryEntrySerializer,
    AppUserSerializer,
    AppUserUpdateSerializer,
)
from .models import PatientProfile, InputInfoPage, DiaryEntry, AppUser


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