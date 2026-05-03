import random
import json
import re

from django.utils import timezone

from RAG.groq_client import MissingGroqAPIKeyError, build_chat_groq
from RAG.question_generator import generate_questions_for_profile, reword_question_for_retry
from RAG.vector_database import VectorStore
from .models import GeneratedQuestion


def _normalize_answer(value):
    return str(value or "").strip().lower()


def _tokenize_answer(value):
    normalized = re.sub(r"[^\w\s]", " ", _normalize_answer(value))
    return {
        token
        for token in normalized.split()
        if len(token) > 2
        and token
        not in {
            "the",
            "and",
            "for",
            "with",
            "from",
            "his",
            "her",
            "their",
            "your",
            "patient",
            "degree",
            "completed",
            "completing",
            "getting",
            "earned",
            "earning",
            "received",
            "receiving",
            "university",
            "college",
            "school",
            "elementary",
            "middle",
            "high",
        }
    }


_SEMANTIC_CLUSTERS = [
    {"graduate", "graduated", "graduating", "college", "university", "masters", "master", "degree", "law", "nursing", "school", "diploma"},
    {"married", "wedding", "spouse", "husband", "wife"},
    {"child", "children", "son", "daughter", "parent", "family"},
    {"job", "career", "work", "occupation", "retired", "business"},
    {"home", "house", "moved", "city", "town"},
]
_EDUCATION_ACHIEVEMENT_TERMS = {"graduate", "graduated", "graduating", "masters", "master", "degree", "diploma"}


def _matching_semantic_clusters(value):
    normalized = set(re.sub(r"[^\w\s]", " ", _normalize_answer(value)).split())
    matches = []
    for index, cluster in enumerate(_SEMANTIC_CLUSTERS):
        if not normalized & cluster:
            continue
        if index == 0 and not normalized & _EDUCATION_ACHIEVEMENT_TERMS:
            continue
        matches.append(cluster)
    return matches


def _option_too_close_to_correct(option, correct):
    option_key = _normalize_answer(option)
    correct_key = _normalize_answer(correct)
    if not option_key or not correct_key:
        return True
    if option_key == correct_key or option_key in correct_key or correct_key in option_key:
        return True

    option_tokens = _tokenize_answer(option)
    correct_tokens = _tokenize_answer(correct)
    if option_tokens and correct_tokens:
        overlap = len(option_tokens & correct_tokens) / min(len(option_tokens), len(correct_tokens))
        if overlap >= 0.5:
            return True

    correct_clusters = _matching_semantic_clusters(correct)
    if correct_clusters and any(set(re.sub(r"[^\w\s]", " ", option_key).split()) & cluster for cluster in correct_clusters):
        return True

    return False


def _question_topic_key(question):
    correct = _normalize_answer(question.correct_answer)
    if correct:
        return correct
    words = _tokenize_answer(question.question_text)
    return " ".join(sorted(words)) or _normalize_answer(question.question_text)


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


def _answer_subtype(question):
    text = _normalize_answer(question.question_text)
    if "father" in text or "husband" in text or "brother" in text or "son" in text:
        return "male first names"
    if "mother" in text or "wife" in text or "sister" in text or "daughter" in text:
        return "female first names"
    if "patient name" in text or "your name" in text or "what is your name" in text:
        return "person names"
    kind = _question_answer_kind(question)
    return {
        "person_name": "person names",
        "school": "specific school names",
        "place": "city or place names",
        "color": "color names",
        "food": "food names",
        "work": "jobs or occupations",
        "music": "songs, artists, or music genres",
        "activity": "hobbies or activities",
        "number": "numbers",
    }.get(kind, "same type as the correct answer")


def _profile_answer_keys(profile, allowed_answers=None):
    allowed = {_normalize_answer(answer) for answer in (allowed_answers or []) if answer}
    keys = set()
    for field in profile.fields.exclude(answer__exact="").exclude(answer__isnull=True):
        key = _normalize_answer(field.answer)
        if key and key not in allowed:
            keys.add(key)
    return keys


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
        difficulty += 0.8
    else:
        difficulty += wrong * 4.0
        difficulty += (1 - (accuracy or 0)) * 5.5
        difficulty += wrong_streak * 3.0

    if wrong > 0:
        difficulty += 4.0 + min(wrong, 4) * 1.5

    if question.reprompt_count:
        difficulty += min(question.reprompt_count, 3) * 0.2

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


def _extract_json_strings(raw):
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except json.JSONDecodeError:
        return []
    return []


def _generate_llm_distractors(question, forbidden_answers, recent_wrong_answers=None, target_count=8):
    correct = str(question.correct_answer or "").strip()
    if not correct:
        return []

    subtype = _answer_subtype(question)
    wrong_answers = [answer for answer in (recent_wrong_answers or []) if answer]
    prompt = f"""Generate fresh multiple-choice distractors for a dementia memory question.

Question:
{question.question_text}

Correct answer:
{correct}

Answer type required:
{subtype}

Rules:
- Return ONLY a JSON array of strings.
- Generate {target_count} plausible distractors.
- Every distractor must be the exact same answer type as "{correct}".
- Make every distractor clearly different from the correct answer. Do not use the same subcategory, credential, life event, wording, or achievement.
- Do not include the correct answer.
- Do not include any patient/profile answers from the forbidden list.
- Do not include generic placeholders like "not sure" or "none of these".
- If the question asks for a father's name, use male first names only.
- If the question asks for a mother's name, use female first names only.
- If recent wrong answers are listed, you may include them only if they match the required answer type.

Forbidden patient/profile answers:
{json.dumps(sorted(forbidden_answers), ensure_ascii=True)}

Recent wrong answers that may be reused if same type:
{json.dumps(wrong_answers, ensure_ascii=True)}
"""

    try:
        llm = build_chat_groq("llama-3.3-70b-versatile")
        response = llm.invoke(prompt)
    except MissingGroqAPIKeyError:
        return []
    except Exception as exc:
        print(f"[WARN] Failed to generate fresh distractors: {exc}")
        return []

    return _extract_json_strings(response.content.strip())


def _fresh_options(question, option_history, forbidden_answer_keys, recent_wrong_answers=None):
    correct = str(question.correct_answer or "").strip()
    if not correct:
        return []

    correct_key = _normalize_answer(correct)
    recent_wrong_answers = [answer for answer in (recent_wrong_answers or []) if answer]
    allowed_wrong_keys = {_normalize_answer(answer) for answer in recent_wrong_answers}
    previous_layouts = option_history.setdefault(question.id, [])
    previous_sets = {tuple(sorted(_normalize_answer(option) for option in layout)) for layout in previous_layouts}
    previous_correct_positions = [
        layout.index(correct)
        for layout in previous_layouts
        if correct in layout
    ]

    subtype = _answer_subtype(question)
    base_distractors = [
        str(option).strip()
        for option in (question.options or [])
        if _normalize_answer(option)
        and _normalize_answer(option) != correct_key
        and not _option_too_close_to_correct(option, correct)
        and (
            _normalize_answer(option) not in forbidden_answer_keys
            or _normalize_answer(option) in allowed_wrong_keys
        )
    ]

    generated_distractors = _generate_llm_distractors(
        question,
        forbidden_answer_keys | {correct_key},
        recent_wrong_answers=recent_wrong_answers,
        target_count=8,
    ) if len(base_distractors) < 6 or len(previous_layouts) > 0 else []

    candidates = []
    seen = set()
    if subtype in {"male first names", "female first names"}:
        candidate_sources = [*recent_wrong_answers, *generated_distractors, *base_distractors]
    else:
        candidate_sources = [*recent_wrong_answers, *base_distractors, *generated_distractors]

    for option in candidate_sources:
        key = _normalize_answer(option)
        if (
            key
            and key not in seen
            and key != correct_key
            and not _option_too_close_to_correct(option, correct)
            and (key not in forbidden_answer_keys or key in allowed_wrong_keys)
        ):
            seen.add(key)
            candidates.append(option)

    if len(candidates) >= 6:
        updated_options = [correct, *candidates[:8]]
        if question.options != updated_options:
            question.options = updated_options
            question.save(update_fields=["options"])

    def make_distinct_from_previous(layout):
        if not previous_layouts or layout != previous_layouts[-1]:
            return layout

        previous_layout = previous_layouts[-1]
        previous_keys = {_normalize_answer(option) for option in previous_layout}
        replacement = next(
            (
                option
                for option in candidates
                if _normalize_answer(option) not in previous_keys
            ),
            None,
        )

        if replacement:
            varied = list(layout)
            for index, option in enumerate(varied):
                if _normalize_answer(option) != correct_key:
                    varied[index] = replacement
                    return varied

        if len(layout) > 1:
            varied = list(layout)
            correct_index = varied.index(correct) if correct in varied else 0
            swap_index = 0 if correct_index != 0 else 1
            varied[correct_index], varied[swap_index] = varied[swap_index], varied[correct_index]
            return varied

        return layout

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

    best_layout = make_distinct_from_previous(best_layout)
    option_history[question.id].append(best_layout)
    return best_layout


def _serialize_for_session(question, option_history, forbidden_answer_keys, recent_wrong_answers=None, override_text=None, is_reprompt=False):
    return {
        "id": question.id,
        "question_text": override_text or question.question_text,
        "options": _fresh_options(
            question,
            option_history,
            forbidden_answer_keys,
            recent_wrong_answers=recent_wrong_answers,
        ),
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

    option_history = {}
    stats_by_question = [{"question": q, "stats": _question_stats(q)} for q in questions]
    reprompt_slots = 0
    if mode == "adaptive" and count >= 5:
        reprompt_slots = min(2, max(1, count // 4))

    base_count = max(1, count - reprompt_slots)
    if mode == "adaptive":
        struggled = [item for item in stats_by_question if item["stats"]["wrong"] > 0 or item["stats"]["wrong_streak"] > 0]
        fresh_or_review = [item for item in stats_by_question if item not in struggled]
        selected = []
        seen_topics = set()
        for item in sorted(struggled, key=lambda entry: entry["stats"]["difficulty"], reverse=True):
            topic_key = _question_topic_key(item["question"])
            if topic_key in seen_topics:
                continue
            selected.append(item)
            seen_topics.add(topic_key)
            if len(selected) >= base_count:
                break
        for item in _weighted_sample(fresh_or_review, base_count - len(selected)):
            topic_key = _question_topic_key(item["question"])
            if topic_key in seen_topics:
                continue
            selected.append(item)
            seen_topics.add(topic_key)
            if len(selected) >= base_count:
                break
    else:
        selected = []
        seen_topics = set()
        for item in _weighted_sample(stats_by_question, base_count):
            topic_key = _question_topic_key(item["question"])
            if topic_key in seen_topics:
                continue
            selected.append(item)
            seen_topics.add(topic_key)

    if len(selected) < base_count:
        selected_ids = {item["question"].id for item in selected}
        selected_topics = {_question_topic_key(item["question"]) for item in selected}
        remaining = [item for item in stats_by_question if item["question"].id not in selected_ids]
        for item in _weighted_sample(remaining, len(remaining)):
            topic_key = _question_topic_key(item["question"])
            if topic_key in selected_topics:
                continue
            selected.append(item)
            selected_topics.add(topic_key)
            if len(selected) >= base_count:
                break
        if len(selected) < base_count:
            selected_ids = {item["question"].id for item in selected}
            remaining = [item for item in stats_by_question if item["question"].id not in selected_ids]
            selected.extend(_weighted_sample(remaining, base_count - len(selected)))

    if mode == "practice":
        random.shuffle(selected)
    else:
        selected.sort(key=lambda item: item["stats"]["difficulty"], reverse=True)

    session_questions = [
        _serialize_for_session(
            item["question"],
            option_history,
            _profile_answer_keys(
                profile,
                allowed_answers=[
                    item["question"].correct_answer,
                    *item["stats"]["recent_wrong_answers"],
                ],
            ),
            recent_wrong_answers=item["stats"]["recent_wrong_answers"],
        )
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
            intervening_questions = 1 if candidate["stats"]["wrong"] >= 2 or candidate["stats"]["wrong_streak"] >= 2 else 2
            insert_at = min(len(session_questions), original_index + intervening_questions + 1)
            if insert_at <= original_index + 1:
                continue
            session_questions.insert(
                insert_at,
                _serialize_for_session(
                    question,
                    option_history,
                    _profile_answer_keys(
                        profile,
                        allowed_answers=[
                            question.correct_answer,
                            *candidate["stats"]["recent_wrong_answers"],
                        ],
                    ),
                    recent_wrong_answers=candidate["stats"]["recent_wrong_answers"],
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
