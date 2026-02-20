from django.urls import path

from .views import AppUserCreateAPIView, AppUserDetailUpdateView, AppUserDetailByIdView

urlpatterns = [
    # Users
    path("api/users/", AppUserCreateAPIView.as_view(), name="create-user"),
    path("me/", AppUserDetailUpdateView.as_view(), name="user-detail-update"),
    path("api/users/<int:id>/", AppUserDetailByIdView.as_view(), name="user-detail-by-id"),
]