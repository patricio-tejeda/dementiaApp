
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
# add back in once merged since it needs AppUser
# router.register(r'profiles', views.PatientProfileView, basename='profile')
router.register(r'fields', views.InputInfoPageView, basename='fields')

urlpatterns = [
    path('api/', include(router.urls)),
]
