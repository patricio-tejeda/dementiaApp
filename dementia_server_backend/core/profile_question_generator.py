import json
import re

from RAG.groq_client import build_chat_groq


IMPORTANT_MEMORY_AREAS = [
    "close family and important relationships",
    "home, hometown, and meaningful places",
    "school, work, and life roles",
    "daily routines, comforting habits, and supports",
    "favorite foods, music, hobbies, and preferences",
    "important life events, traditions, and treasured memories",
]


def _normalize(text: str) -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _profile_summary(profile) -> str:
    filled = []
    blank = []
    for field in profile.fields.all().order_by("order", "id"):
        title = (field.title or "").strip()
        answer = (field.answer or "").strip()
        if answer:
            filled.append(f"- {title}: {answer}")
        else:
            blank.append(f"- {title}")

    parts = []
    if filled:
        parts.append("Known profile information:\n" + "\n".join(filled))
    if blank:
        parts.append("Existing profile questions without answers yet:\n" + "\n".join(blank))
    if not parts:
        parts.append("No profile information has been filled in yet.")
    return "\n\n".join(parts)


def _extract_questions_from_text(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            values = []
            for item in parsed:
                if isinstance(item, str):
                    values.append(item)
                elif isinstance(item, dict):
                    question = item.get("question") or item.get("title") or item.get("prompt")
                    if isinstance(question, str):
                        values.append(question)
            if values:
                return values
    except json.JSONDecodeError:
        pass

    matches = re.findall(r'"([^"\n]{8,200}\?)"', raw)
    if matches:
        return matches

    fallback = []
    for line in raw.splitlines():
        cleaned = line.strip().lstrip("-*0123456789. ").strip()
        if cleaned.endswith("?") and len(cleaned) > 8:
            fallback.append(cleaned)
    return fallback


def _is_near_duplicate(question: str, existing_normalized: set[str]) -> bool:
    normalized = _normalize(question)
    tokens = set(normalized.split())
    if normalized in existing_normalized:
        return True
    for existing in existing_normalized:
        existing_tokens = set(existing.split())
        if not tokens or not existing_tokens:
            continue
        overlap = len(tokens & existing_tokens)
        smaller = min(len(tokens), len(existing_tokens))
        if smaller and overlap / smaller >= 0.7:
            return True
    return False


def _sanitize_questions(questions: list[str], existing_titles: list[str], count: int) -> list[str]:
    existing = {_normalize(title) for title in existing_titles if title}
    cleaned = []
    seen = set()

    for question in questions:
        text = re.sub(r"\s+", " ", (question or "").strip())
        text = text.strip('"').strip()
        if not text:
            continue
        if not text.endswith("?"):
            text = text.rstrip(".") + "?"
        normalized = _normalize(text)
        if len(normalized) < 8:
            continue
        if _is_near_duplicate(text, existing | seen):
            continue
        seen.add(normalized)
        cleaned.append(text)
        if len(cleaned) >= count:
            break

    return cleaned


def generate_profile_followup_questions(profile, count: int = 5, avoid_titles: list[str] | None = None) -> list[str]:
    llm = build_chat_groq("llama-3.3-70b-versatile")

    existing_titles = list(
        profile.fields.all().order_by("order", "id").values_list("title", flat=True)
    )
    existing_titles.extend(avoid_titles or [])
    context = _profile_summary(profile)
    areas = "\n".join(f"- {area}" for area in IMPORTANT_MEMORY_AREAS)
    count = max(1, min(count, 12))
    generation_count = max(count * 3, count + 8)

    prompt = f"""You are helping build a dementia-friendly patient memory profile.
Generate additional profile questions that would help caregivers and memory games understand
the most important things this person should remember about their life.

Your job:
- Suggest NEW follow-up profile questions only.
- Base them on important memory-support topics, not random trivia.
- Prefer missing information or areas that would improve orientation, comfort, identity, and family connection.
- Avoid duplicates or near-duplicates of existing profile questions.
- Avoid asking several versions of the same topic in one response.
- Cover a broad range of topics across family, places, work, routines, preferences, traditions, and comforting memories.
- You may ask a natural follow-up to a known answer when it adds useful detail.
  Example: if the profile says the patient has one sibling, ask whether it was a sister or brother;
  after that, ask the sibling's name or a favorite memory with them.
- Create the questions yourself. Do not copy the examples verbatim.
- Keep each question short, concrete, and compassionate.
- Questions should be suitable for a caregiver filling in a patient profile.
- Return ONLY a JSON array of strings.

Important memory-support areas:
{areas}

Current patient profile:
{context}

Existing profile question titles to avoid repeating:
{json.dumps(existing_titles, ensure_ascii=True)}

Generate {generation_count} distinct profile questions so the app can keep the best {count}.
"""

    response = llm.invoke(prompt)
    raw = response.content.strip()
    llm_questions = _extract_questions_from_text(raw)
    questions = _sanitize_questions(llm_questions, existing_titles, count)
    if questions:
        return questions

    retry_prompt = f"""You are helping a caregiver complete a dementia memory profile.
The first attempt returned no usable new questions.

Generate {generation_count} short, useful follow-up profile questions that cover missing or underexplored
memory-support topics for this person. Focus on identity, orientation, loved ones, comforting routines,
important places, favorite activities, music, traditions, and meaningful memories.

Do not repeat any existing question title.
Return ONLY a JSON array of strings.

Current patient profile:
{context}

Existing profile question titles to avoid:
{json.dumps(existing_titles, ensure_ascii=True)}
"""

    retry_response = llm.invoke(retry_prompt)
    retry_raw = retry_response.content.strip()
    return _sanitize_questions(_extract_questions_from_text(retry_raw), existing_titles, count)
