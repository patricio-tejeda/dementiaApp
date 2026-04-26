import random

from django.utils import timezone

from RAG.question_generator import generate_questions_for_profile, reword_question_for_retry
from RAG.vector_database import VectorStore
from .models import GeneratedQuestion


def desired_question_bank_size(profile, minimum: int = 12) -> int:
    data_points = max(profile.data_point_count(), 1)
    return max(minimum, min(40, data_points * 2))


def ensure_question_bank(profile, desired_total: int, rebuild_store: bool = False) -> int:
    if rebuild_store:
        from RAG.data_loader import process_all_sql

        docs = process_all_sql(".")
        store = VectorStore("faiss_store")
        store.build_from_document(docs)

    attempts = 0
    current_total = GeneratedQuestion.objects.filter(profile=profile).count()

    while current_total < desired_total and attempts < 4:
        attempts += 1
        needed = desired_total - current_total
        before = current_total
        generate_questions_for_profile(profile, count=needed)
        current_total = GeneratedQuestion.objects.filter(profile=profile).count()

        if current_total <= before:
            break

    return current_total


def _question_stats(question):
    attempts = list(question.attempts.order_by("-created_at")[:5])
    total = question.times_asked()
    wrong = question.times_wrong()
    accuracy = question.accuracy()
    wrong_streak = 0
    for attempt in attempts:
        if attempt.is_correct:
            break
        wrong_streak += 1

    recent_wrong_answers = [
        attempt.selected_answer
        for attempt in attempts
        if not attempt.is_correct and attempt.selected_answer
    ]

    difficulty = 1.0
    if total == 0:
        difficulty += 2.6
    else:
        difficulty += wrong * 1.4
        difficulty += (1 - (accuracy or 0)) * 4.0
        difficulty += wrong_streak * 1.2

    if question.reprompt_count:
        difficulty += min(question.reprompt_count, 3) * 0.35

    if question.question_type == "free_recall":
        difficulty += 0.4

    return {
        "total": total,
        "wrong": wrong,
        "accuracy": accuracy,
        "wrong_streak": wrong_streak,
        "recent_wrong_answers": recent_wrong_answers,
        "difficulty": max(difficulty, 0.1),
    }


def _weighted_sample(question_stats, count):
    pool = list(question_stats)
    selected = []
    while pool and len(selected) < count:
        weights = [max(item["stats"]["difficulty"], 0.1) for item in pool]
        picked = random.choices(pool, weights=weights, k=1)[0]
        selected.append(picked)
        pool.remove(picked)
    return selected


def _shuffle_options(question):
    options = list(question.options or [])
    random.shuffle(options)
    return options


def _serialize_for_session(question, override_text=None, is_reprompt=False):
    return {
        "id": question.id,
        "question_text": override_text or question.question_text,
        "options": _shuffle_options(question),
        "correct_answer": question.correct_answer,
        "category": question.category,
        "question_type": question.question_type,
        "reprompt_count": question.reprompt_count,
        "times_asked": question.times_asked(),
        "times_wrong": question.times_wrong(),
        "is_reprompt": is_reprompt,
    }


def build_question_session(profile, mode="practice", count=10, ensure_bank=False):
    count = max(1, count)
    if ensure_bank:
        bank_target = max(desired_question_bank_size(profile), count * 2)
        ensure_question_bank(profile, desired_total=bank_target, rebuild_store=False)

    questions = list(GeneratedQuestion.objects.filter(profile=profile))
    if not questions:
        return []

    stats_by_question = [{"question": q, "stats": _question_stats(q)} for q in questions]
    reprompt_slots = 0
    if mode == "adaptive" and count >= 5:
        reprompt_slots = min(2, max(1, count // 4))

    base_count = max(1, count - reprompt_slots)
    selected = _weighted_sample(stats_by_question, base_count)

    if mode == "practice":
        random.shuffle(selected)
    else:
        selected.sort(key=lambda item: item["stats"]["difficulty"], reverse=True)

    session_questions = [_serialize_for_session(item["question"]) for item in selected]

    if mode == "adaptive" and reprompt_slots > 0:
        reprompt_candidates = [
            item for item in selected
            if item["question"].question_type == "mcq"
            and (item["stats"]["wrong"] > 0 or item["stats"]["wrong_streak"] > 0)
        ]
        reprompt_candidates.sort(key=lambda item: item["stats"]["difficulty"], reverse=True)

        for candidate in reprompt_candidates[:reprompt_slots]:
            question = candidate["question"]
            rewritten = reword_question_for_retry(
                profile,
                question,
                wrong_answers=candidate["stats"]["recent_wrong_answers"],
            )
            original_index = next(
                (index for index, item in enumerate(session_questions) if item["id"] == question.id),
                len(session_questions) - 1,
            )
            insert_at = min(len(session_questions), original_index + 3)
            session_questions.insert(
                insert_at,
                _serialize_for_session(
                    question,
                    override_text=rewritten,
                    is_reprompt=True,
                ),
            )
            question.reprompt_count += 1
            question.last_reprompted_at = timezone.now()
            question.save(update_fields=["reprompt_count", "last_reprompted_at"])

    if mode == "practice":
        random.shuffle(session_questions)

    return session_questions[:count]
