from rest_framework import generics, permissions
from .models import AppUser
from .serializers import AppUserSerializer, AppUserUpdateSerializer

class AppUserCreateAPIView(generics.CreateAPIView):
    queryset = AppUser.objects.all()
    serializer_class = AppUserSerializer

class AppUserDetailUpdateView(generics.RetrieveUpdateAPIView):
    """
    GET: return user info
    PUT/PATCH: update allowed fields
    """
    serializer_class = AppUserUpdateSerializer
    permission_classes = []
    queryset = AppUser.objects.all()


    def get_object(self):
        # Return the currently logged-in user
        user_id = self.kwargs.get("id")
        return generics.get_object_or_404(AppUser, id=user_id)    

class AppUserDetailByIdView(generics.RetrieveAPIView):
    serializer_class = AppUserSerializer
    permission_classes = []
    queryset = AppUser.objects.all()

    def get_object(self):
        user_id = self.kwargs.get("id")
        print("HEREE")
        print(self.queryset)
        return generics.get_object_or_404(AppUser, id=user_id)