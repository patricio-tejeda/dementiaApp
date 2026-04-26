from django.contrib import admin
from .models import InputInfoPage, PatientProfile


class InputInfoInline(admin.TabularInline):
    model = InputInfoPage
    extra = 1

# register models -------------------------------
@admin.register(PatientProfile)
class PatientProfileAdmin(admin.ModelAdmin):
    inlines = [InputInfoInline]
    list_display = ("__str__", "created_at", "updated_at")

@admin.register(InputInfoPage)
class InputInfoAdmin(admin.ModelAdmin):
    list_display = ("title", "required", "is_custom", "answer")
