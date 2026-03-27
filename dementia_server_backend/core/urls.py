
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
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import AppUserCreateAPIView, AppUserDetailUpdateView, AppUserDetailByIdView

urlpatterns = [
    # Auth
    path("api/auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),

    # Users
    path("api/users/", AppUserCreateAPIView.as_view(), name="create-user"),
    path("me/", AppUserDetailUpdateView.as_view(), name="user-detail-update"),
    path("api/users/<int:id>/", AppUserDetailByIdView.as_view(), name="user-detail-by-id"),
]
