from unittest.mock import patch

from django.test import TestCase

from .models import AppUser, GeneratedQuestion, PatientProfile, QuestionAttempt
from .question_sessions import build_question_session
from .serializers import QuestionAttemptSerializer


class QuestionSessionTests(TestCase):
    def setUp(self):
        self.user = AppUser.objects.create_user(
            username="tester",
            password="pass1234",
            full_name="Test User",
            address="123 Main St",
            phone_number="+15555550123",
            birthplace="Tucson",
            elementary_school="Lincoln Elementary",
            favorite_ice_cream="Vanilla",
        )
        self.profile = PatientProfile.objects.create(user=self.user)

    @patch("core.question_sessions.ensure_question_bank")
    @patch("core.question_sessions.reword_question_for_retry")
    def test_adaptive_session_includes_reprompt_for_struggled_question(self, mock_reword, mock_ensure_bank):
        mock_reword.return_value = "Can you tell me which school you went to?"

        hard_question = GeneratedQuestion.objects.create(
            profile=self.profile,
            question_text="What elementary school did you attend?",
            options=["Lincoln Elementary", "Roosevelt Elementary", "Mesa Vista", "Desert Sun"],
            correct_answer="Lincoln Elementary",
            category="education",
            question_type="mcq",
        )
        easy_question = GeneratedQuestion.objects.create(
            profile=self.profile,
            question_text="What is your favorite color?",
            options=["Blue", "Green", "Red", "Purple"],
            correct_answer="Blue",
            category="personal",
            question_type="mcq",
        )

        QuestionAttempt.objects.create(
            question=hard_question,
            selected_answer="Roosevelt Elementary",
            is_correct=False,
        )
        QuestionAttempt.objects.create(
            question=hard_question,
            selected_answer="Mesa Vista",
            is_correct=False,
        )
        QuestionAttempt.objects.create(
            question=easy_question,
            selected_answer="Blue",
            is_correct=True,
        )

        session = build_question_session(self.profile, mode="adaptive", count=5)

        self.assertTrue(any(item["is_reprompt"] for item in session))
        reprompt = next(item for item in session if item["is_reprompt"])
        self.assertEqual(reprompt["id"], hard_question.id)
        self.assertEqual(reprompt["question_text"], "Can you tell me which school you went to?")


class QuestionAttemptSerializerTests(TestCase):
    def setUp(self):
        self.user = AppUser.objects.create_user(
            username="tester2",
            password="pass1234",
            full_name="Test User",
            address="123 Main St",
            phone_number="+15555550124",
            birthplace="Phoenix",
            elementary_school="Desert Elementary",
            favorite_ice_cream="Chocolate",
        )
        self.profile = PatientProfile.objects.create(user=self.user)
        self.question = GeneratedQuestion.objects.create(
            profile=self.profile,
            question_text="What city did you grow up in?",
            options=["Phoenix", "Mesa", "Tempe", "Flagstaff"],
            correct_answer="Phoenix",
            category="personal",
            question_type="mcq",
        )

    def test_attempt_serializer_marks_mcq_correctness(self):
        serializer = QuestionAttemptSerializer(data={
            "question": self.question.id,
            "selected_answer": "Mesa",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        attempt = serializer.save()
        self.assertFalse(attempt.is_correct)
