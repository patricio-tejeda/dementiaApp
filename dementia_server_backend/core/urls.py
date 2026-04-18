from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

router = DefaultRouter()
router.register(r'profiles', views.PatientProfileView, basename='profile')
router.register(r'fields', views.InputInfoPageView, basename='fields')
router.register(r'diary', views.DiaryEntryView, basename='diary')

urlpatterns = [
    path('api/', include(router.urls)),

    # Auth
    path("api/auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),

    # Users
    path("api/users/", views.AppUserCreateAPIView.as_view(), name="create-user"),
    path("me/", views.AppUserDetailUpdateView.as_view(), name="user-detail-update"),
    path("api/users/<int:id>/", views.AppUserDetailByIdView.as_view(), name="user-detail-by-id"),
]