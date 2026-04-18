from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

router = DefaultRouter()
router.register(r'profiles', views.PatientProfileView, basename='profile')
router.register(r'fields', views.InputInfoPageView, basename='fields')
router.register(r'diary', views.DiaryEntryView, basename='diary')
router.register(r'questions', views.GeneratedQuestionView, basename='questions')
router.register(r'attempts', views.QuestionAttemptView, basename='attempts')

urlpatterns = [
    path('api/', include(router.urls)),

    # Current user's profile (auto-created on first request)
    path("api/me/profile/", views.MyProfileView.as_view(), name="my-profile"),

    # Auth
    path("api/auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),

    # Users
    path("api/users/", views.AppUserCreateAPIView.as_view(), name="create-user"),
    path("me/", views.AppUserDetailUpdateView.as_view(), name="user-detail-update"),
    path("api/users/<int:id>/", views.AppUserDetailByIdView.as_view(), name="user-detail-by-id"),
]