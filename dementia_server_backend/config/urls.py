"""
URL configuration for dementia_server_backend project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework import routers
from core import views

router = routers.DefaultRouter()
router.register(r'core', views.InputInfoPageView, 'core')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
    path('', include(router.urls))
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)