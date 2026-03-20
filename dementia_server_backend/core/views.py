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