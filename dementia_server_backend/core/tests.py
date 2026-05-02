from unittest.mock import patch

from django.test import TestCase

from RAG.question_generator import _build_context

from .models import AppUser, GeneratedQuestion, InputInfoPage, PatientProfile, QuestionAttempt
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

    @patch("core.question_sessions.ensure_question_bank")
    @patch("core.question_sessions.reword_question_for_retry")
    def test_reprompt_gets_fresh_option_layout(self, mock_reword, mock_ensure_bank):
        mock_reword.return_value = "Can you tell me which school you went to?"

        hard_question = GeneratedQuestion.objects.create(
            profile=self.profile,
            question_text="What elementary school did you attend?",
            options=["Lincoln Elementary", "Roosevelt Elementary", "Mesa Vista", "Desert Sun"],
            correct_answer="Lincoln Elementary",
            category="education",
            question_type="mcq",
        )

        for title, answer in [
            ("High School", "Central High"),
            ("College", "University of Arizona"),
            ("Hometown", "Tucson"),
            ("Favorite Color", "Blue"),
        ]:
            InputInfoPage.objects.create(
                profile=self.profile,
                title=title,
                answer=answer,
                category="personal",
            )

        QuestionAttempt.objects.create(
            question=hard_question,
            selected_answer="Roosevelt Elementary",
            is_correct=False,
        )

        session = build_question_session(self.profile, mode="adaptive", count=5)
        copies = [item for item in session if item["id"] == hard_question.id]

        self.assertGreaterEqual(len(copies), 2)
        first_options = copies[0]["options"]
        reprompt_options = copies[1]["options"]
        self.assertIn("Lincoln Elementary", first_options)
        self.assertIn("Lincoln Elementary", reprompt_options)
        self.assertNotEqual(first_options, reprompt_options)
        self.assertNotEqual(
            first_options.index("Lincoln Elementary"),
            reprompt_options.index("Lincoln Elementary"),
        )
        school_answers = {
            "Lincoln Elementary",
            "Roosevelt Elementary",
            "Mesa Vista",
            "Desert Sun",
            "Central High",
            "University of Arizona",
        }
        self.assertTrue(set(first_options).issubset(school_answers))
        self.assertTrue(set(reprompt_options).issubset(school_answers))
        self.assertNotIn("Tucson", first_options + reprompt_options)
        self.assertNotIn("Blue", first_options + reprompt_options)

    def test_name_question_only_uses_name_options(self):
        GeneratedQuestion.objects.create(
            profile=self.profile,
            question_text="What is your father's name?",
            options=["Jose", "Robert", "Michael", "David", "James", "William"],
            correct_answer="Jose",
            category="family",
            question_type="mcq",
        )

        for title, answer in [
            ("Mother's Name", "Maria"),
            ("Hometown", "Tucson"),
            ("Favorite Color", "Blue"),
            ("Favorite Food", "Vanilla"),
        ]:
            InputInfoPage.objects.create(
                profile=self.profile,
                title=title,
                answer=answer,
                category="personal",
            )

        session = build_question_session(self.profile, mode="practice", count=1)
        options = session[0]["options"]

        name_answers = {"Jose", "Robert", "Michael", "David", "James", "William", "Maria"}
        self.assertTrue(set(options).issubset(name_answers))
        self.assertNotIn("Tucson", options)
        self.assertNotIn("Blue", options)
        self.assertNotIn("Vanilla", options)


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


class QuestionGenerationContextTests(TestCase):
    def test_context_only_includes_current_profile_answers(self):
        user_one = AppUser.objects.create_user(
            username="context-user-one",
            password="pass1234",
            full_name="Context User One",
            address="123 Main St",
            phone_number="+15555550125",
            birthplace="Tucson",
            elementary_school="Lincoln Elementary",
            favorite_ice_cream="Vanilla",
        )
        user_two = AppUser.objects.create_user(
            username="context-user-two",
            password="pass1234",
            full_name="Context User Two",
            address="456 Main St",
            phone_number="+15555550126",
            birthplace="Phoenix",
            elementary_school="Desert Elementary",
            favorite_ice_cream="Chocolate",
        )
        profile_one = PatientProfile.objects.create(user=user_one)
        profile_two = PatientProfile.objects.create(user=user_two)

        InputInfoPage.objects.create(
            profile=profile_one,
            title="Hometown",
            answer="Tucson",
            category="personal",
        )
        InputInfoPage.objects.create(
            profile=profile_two,
            title="Hometown",
            answer="Phoenix",
            category="personal",
        )

        context = _build_context(profile_one, store=None)

        self.assertIn("Tucson", context)
        self.assertNotIn("Phoenix", context)
