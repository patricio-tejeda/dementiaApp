from django.shortcuts import render
from rest_framework import viewsets
from .serializers import PatientProfileSerializer, InputInfoSerializer
from .models import PatientProfile, InputInfoPage

# Create your views here.
class PatientProfileView(viewsets.ModelViewSet):
    serializer_class = PatientProfileSerializer
    queryset = PatientProfile.objects.all()

class InputInfoPageView(viewsets.ModelViewSet):
    serializer_class = InputInfoSerializer

    def get_queryset(self):
        profile_id = self.request.query_params.get('profile', None)
        if profile_id:
            return InputInfoPage.objects.filter(profile_id=profile_id)
        # return PatientProfile.objects.filter(caregiver=self.request.user) -> add back in when merged since this needs AppUser
        return InputInfoPage.objects.all()
    
    def perform_create(self, serializer):
        serializer.save(caregiver=self.request.user)
from rest_framework import generics, permissions
from .models import AppUser
from .serializers import AppUserSerializer, AppUserUpdateSerializer


class AppUserCreateAPIView(generics.CreateAPIView):
    """
    Register a new user, no auth required.
    """
    queryset = AppUser.objects.all()
    serializer_class = AppUserSerializer
    permission_classes = [permissions.AllowAny]


class AppUserDetailUpdateView(generics.RetrieveUpdateAPIView):
    """
    GET  /me/   — return the currently logged-in user's info
    PUT  /me/   — update allowed fields (full_name, address, email, phone_number)
    PATCH /me/  — partial update
    """
    serializer_class = AppUserUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # The authenticated user is already on the request — no id needed
        return self.request.user


class AppUserDetailByIdView(generics.RetrieveAPIView):
    """
    GET /api/users/<id>/
    """
    serializer_class = AppUserSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = AppUser.objects.all()

    def get_object(self):
        user_id = self.kwargs.get("id")
        return generics.get_object_or_404(AppUser, id=user_id)
