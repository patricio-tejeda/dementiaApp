import random

from django.utils import timezone

from RAG.question_generator import generate_questions_for_profile, reword_question_for_retry
from RAG.vector_database import VectorStore
from .models import GeneratedQuestion


def _normalize_answer(value):
    return str(value or "").strip().lower()


def _answer_kind_from_text(text):
    normalized = _normalize_answer(text)
    if any(word in normalized for word in ["how many", "number of", "count"]):
        return "number"
    if any(word in normalized for word in ["mother", "father", "spouse", "husband", "wife", "sibling", "brother", "sister", "son", "daughter", "child", "children", " name"]):
        return "person_name"
    if any(word in normalized for word in ["school", "college", "university", "teacher", "classmate"]):
        return "school"
    if any(word in normalized for word in ["hometown", "birthplace", "city", "town", "place", "home"]):
        return "place"
    if "color" in normalized:
        return "color"
    if any(word in normalized for word in ["food", "meal", "ice cream", "dessert"]):
        return "food"
    if any(word in normalized for word in ["job", "work", "occupation", "career"]):
        return "work"
    if any(word in normalized for word in ["music", "song", "artist", "band"]):
        return "music"
    if any(word in normalized for word in ["hobby", "activity", "activities", "sport"]):
        return "activity"
    return "unknown"


def _question_answer_kind(question):
    return _answer_kind_from_text(question.question_text)


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


def _add_to_pool(pool, kind, answer):
    answer = str(answer or "").strip()
    key = _normalize_answer(answer)
    if not key:
        return
    bucket = pool.setdefault(kind, [])
    if all(_normalize_answer(existing) != key for existing in bucket):
        bucket.append(answer)


def _profile_answer_pool(profile, questions):
    pool = {}

    for field in profile.fields.exclude(answer__exact="").exclude(answer__isnull=True):
        kind = _answer_kind_from_text(field.title)
        if kind != "unknown":
            _add_to_pool(pool, kind, field.answer)

    for item in questions:
        kind = _question_answer_kind(item)
        if kind == "unknown":
            continue
        _add_to_pool(pool, kind, item.correct_answer)
        for option in item.options or []:
            _add_to_pool(pool, kind, option)

    return pool


def _fresh_options(question, distractor_pool, option_history):
    correct = str(question.correct_answer or "").strip()
    if not correct:
        return []

    correct_key = _normalize_answer(correct)
    previous_layouts = option_history.setdefault(question.id, [])
    previous_sets = {tuple(sorted(_normalize_answer(option) for option in layout)) for layout in previous_layouts}
    previous_correct_positions = [
        layout.index(correct)
        for layout in previous_layouts
        if correct in layout
    ]

    base_distractors = [
        str(option).strip()
        for option in (question.options or [])
        if _normalize_answer(option) and _normalize_answer(option) != correct_key
    ]
    kind = _question_answer_kind(question)
    same_kind_pool = distractor_pool.get(kind, []) if kind != "unknown" else []
    extra_distractors = [
        str(option).strip()
        for option in same_kind_pool
        if _normalize_answer(option) and _normalize_answer(option) != correct_key
    ]

    candidates = []
    seen = set()
    for option in [*base_distractors, *extra_distractors]:
        key = _normalize_answer(option)
        if key and key not in seen and key != correct_key:
            seen.add(key)
            candidates.append(option)

    best_layout = None
    best_score = -1
    attempts = max(12, len(candidates) * 2)
    for _ in range(attempts):
        distractors = random.sample(candidates, k=min(3, len(candidates)))

        layout = [correct, *distractors[:3]]
        random.shuffle(layout)
        option_set = tuple(sorted(_normalize_answer(option) for option in layout))
        correct_position = layout.index(correct)

        score = 0
        if option_set not in previous_sets:
            score += 2
        if correct_position not in previous_correct_positions:
            score += 1

        if score > best_score:
            best_layout = layout
            best_score = score
        if score == 3:
            break

    if best_layout is None:
        best_layout = [correct]

    option_history[question.id].append(best_layout)
    return best_layout


def _serialize_for_session(question, distractor_pool, option_history, override_text=None, is_reprompt=False):
    return {
        "id": question.id,
        "question_text": override_text or question.question_text,
        "options": _fresh_options(question, distractor_pool, option_history),
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

    distractor_pool = _profile_answer_pool(profile, questions)
    option_history = {}
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

    session_questions = [
        _serialize_for_session(item["question"], distractor_pool, option_history)
        for item in selected
    ]

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
                    distractor_pool,
                    option_history,
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
