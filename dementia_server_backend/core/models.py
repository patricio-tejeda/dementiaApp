from django.db import models

# Create your models here.
class PatientProfile(models.Model):
    # caregiver = models.ForeignKey(
    #     # AppUser, # will be an okay reference when branches are merged
    #     on_delete=models.CASCADE,
    #     related_name="patient_profiles"
    # )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        '''find the patient name'''
        name_field = self.fields.filter(title__iexact="Patient Name").first()
        return name_field.answer if name_field else f"Profile #{self.id}"
     
class InputInfoPage(models.Model):
    """ each title for questions/information that should be inputted into the app by a close relative to the patient 
       (the list of actual questions will be defined in the json file) """
	# titles = models.["Patient Name: ", ""]
    profile = models.ForeignKey(
        PatientProfile, 
        on_delete=models.CASCADE,
        related_name="fields",
        null=True,
        blank=True)

    title = models.CharField(max_length=120)
    answer = models.TextField(blank=True)
    required = models.BooleanField(default=False) # determines if a question is required in order to save the profile information
    is_custom = models.BooleanField(default=False)  # True = caregiver-created field
    order = models.PositiveIntegerField(default=0)   # Controls display order

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.title}: {self.answer[:50]}"
        