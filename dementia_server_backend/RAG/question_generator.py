import os
import json
import re
from langchain_groq import ChatGroq
from RAG.vector_database import VectorStore
from RAG.diary_classifier import classify_diary_entry
from dotenv import load_dotenv

load_dotenv()


def _normalize(s: str) -> str:
    """Lowercase + strip punctuation + collapse whitespace for fuzzy matching."""
    s = s.lower().strip()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _is_near_duplicate_question(new_q: str, existing_qs: list) -> bool:
    """Catch rephrased duplicates, not just exact string matches."""
    new_norm = _normalize(new_q)
    new_tokens = set(new_norm.split())

    for existing in existing_qs:
        existing_norm = _normalize(existing)

        if new_norm == existing_norm:
            return True

        # High token overlap (>=70%) catches "What's your favorite color?"
        # vs "What is your favorite color?" vs "What color is your favorite?"
        existing_tokens = set(existing_norm.split())
        if not existing_tokens or not new_tokens:
            continue
        overlap = len(new_tokens & existing_tokens)
        smaller = min(len(new_tokens), len(existing_tokens))
        if smaller > 0 and overlap / smaller >= 0.7:
            return True

    return False


def _options_have_duplicates(options: list) -> bool:
    """Detect options that are the same thing with different wording
    (e.g. 'UofA' and 'University of Arizona')."""
    normalized = [_normalize(o) for o in options]

    if len(set(normalized)) < len(normalized):
        return True

    # Substring containment catches 'uofa' vs 'university of arizona uofa'
    for i, a in enumerate(normalized):
        for j, b in enumerate(normalized):
            if i >= j:
                continue
            if not a or not b:
                continue
            if a in b or b in a:
                return True

    return False


def _answer_grounded_in_context(correct_answer: str, context: str) -> bool:
    """The correct answer must actually appear in the patient's data."""
    return _normalize(correct_answer) in _normalize(context)


def generate_questions_for_profile(profile, count=5):
    """Generate structured MCQ + free-recall questions from profile + diary data."""

    store = VectorStore("faiss_store")
    store.load()

    groq_api_key = os.getenv("GROQ_API_KEY")
    llm = ChatGroq(groq_api_key=groq_api_key, model_name="llama-3.3-70b-versatile")

    # -------- Diary triage --------
    from core.models import DiaryEntry, GeneratedQuestion

    diary_entries = DiaryEntry.objects.filter(profile=profile)
    rich_diary_texts = []
    sparse_entries = []
    counts = {"low": 0, "sparse": 0, "rich": 0}

    for entry in diary_entries:
        if entry.quality is None:
            result = classify_diary_entry(entry.text)
            entry.quality = result["quality"]
            entry.followup_prompt = result["followup_prompt"]
            entry.save(update_fields=["quality", "followup_prompt"])

        counts[entry.quality] = counts.get(entry.quality, 0) + 1

        if entry.quality == "rich":
            rich_diary_texts.append(entry.text)
            if entry.enrichment:
                rich_diary_texts.append(
                    f"Follow-up on '{entry.text}': {entry.enrichment}"
                )
        elif entry.quality == "sparse":
            if entry.enrichment:
                rich_diary_texts.append(f"{entry.text} ({entry.enrichment})")
            else:
                sparse_entries.append(entry)

    print(
        f"[INFO] Diary triage: {counts['rich']} rich, "
        f"{counts['sparse']} sparse, {counts['low']} discarded "
        f"({diary_entries.count()} total)"
    )

    # -------- Create free-recall questions --------
    free_recall_saved = []
    for entry in sparse_entries:
        existing = GeneratedQuestion.objects.filter(
            profile=profile,
            source_diary_entry=entry,
            question_type="free_recall",
        ).exists()
        if existing or not entry.followup_prompt:
            continue
        try:
            gq = GeneratedQuestion.objects.create(
                profile=profile,
                question_text=entry.followup_prompt,
                options=None,
                correct_answer="",
                category="diary",
                question_type="free_recall",
                source_diary_entry=entry,
            )
            free_recall_saved.append(gq)
            print(f"[INFO] Created free-recall question: {entry.followup_prompt}")
        except Exception as e:
            print(f"[ERROR] Failed to save free-recall question: {e}")

    # -------- Build RAG context --------
    queries = [
        "patient personal information name birthday hometown",
        "patient family mother father siblings",
        "patient education school college",
        "patient favorite things preferences",
    ]

    all_context = []
    for q in queries:
        results = store.query(q, top_k=3)
        for r in results:
            text = r["metadata"].get("text", "") if r["metadata"] else ""
            if text and text not in all_context:
                all_context.append(text)

    for diary_text in rich_diary_texts:
        tagged = f"Diary entry: {diary_text}"
        if tagged not in all_context:
            all_context.append(tagged)

    context = "\n\n".join(all_context)

    if not context:
        print("[WARN] No context found in vector store.")
        return free_recall_saved

    existing_questions = list(
        GeneratedQuestion.objects.filter(
            profile=profile, question_type="mcq"
        ).values_list('question_text', flat=True)
    )
    existing_list = "\n".join(f"- {q}" for q in existing_questions) if existing_questions else "None yet."

    all_saved = list(free_recall_saved)
    remaining = count
    consecutive_empty_batches = 0

    while remaining > 0 and consecutive_empty_batches < 2:
        batch_size = min(remaining, 5)

        prompt = f"""You are creating memory exercise multiple-choice questions for a dementia patient.

You will be given the patient's actual life facts below. You must create questions based STRICTLY on those facts.

CRITICAL RULES:
1. NEVER invent a topic that is not in the Patient Information. If the patient's favorite sports team is not listed, do NOT ask about it. Only ask about facts that are explicitly stated.
2. The "correct_answer" must appear EXACTLY in the Patient Information (same spelling). Copy it verbatim.
3. The "correct_answer" must be copied EXACTLY into one of the "options" — same spelling, same capitalization.
4. All 4 options must be:
   - The SAME TYPE of thing (4 specific school names, or 4 specific colors, or 4 specific cities).
   - DISTINCT — no two options may refer to the same thing. "UofA" and "University of Arizona" are the same answer. "High School" and "Middle School" are generic categories, NOT school names.
   - Plausible — real examples of that category, not placeholder words.
5. NEVER ask about dates, times, or "when" something happened.
6. Every question must be about a DIFFERENT topic than the existing questions listed below. Do not rephrase them.
7. Respond with ONLY a JSON array. No prose, no markdown.

BAD examples (never create these):
- Question: "What color is your favorite sports team?" — team not in patient info, HALLUCINATED.
- Options: ["University High", "High School", "Middle School", "Elementary School"] — only one real school name, rest are generic categories.
- Options: ["UofA", "University of Arizona", "U of A", "Arizona"] — all four refer to the same school.
- Question: "What color is your favorite?" when "What is your favorite color?" already exists — REPHRASED DUPLICATE.

GOOD examples:
- Question: "What is your mother's name?" Options: ["Mary", "Susan", "Linda", "Patricia"]
- Question: "What city did you grow up in?" Options: ["Tucson", "Phoenix", "Flagstaff", "Mesa"]
- Question: "What elementary school did you attend?" Options: ["Lincoln Elementary", "Washington Elementary", "Jefferson Elementary", "Roosevelt Elementary"]

Existing questions to AVOID (do not repeat or rephrase):
{existing_list}

Patient Information (ONLY use facts stated here):
{context}

Each JSON item must have:
- "question": the question text
- "options": array of exactly 4 DISTINCT choices of the same type
- "correct_answer": exact copy of one option, which must also appear in the Patient Information
- "category": one of "personal", "family", "education", "diary"

Generate {batch_size} NEW questions grounded strictly in the Patient Information above. Return ONLY the JSON array."""

        response = llm.invoke(prompt)
        raw = response.content.strip()

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        try:
            questions_data = json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"[ERROR] Failed to parse LLM response as JSON: {e}")
            print(f"[DEBUG] Raw response: {raw[:500]}")
            break

        new_this_batch = 0
        for q in questions_data:
            if not all(k in q for k in ("question", "options", "correct_answer")):
                print(f"[WARN] Skipping — missing keys: {q}")
                continue

            if not isinstance(q["options"], list) or len(q["options"]) != 4:
                print(f"[WARN] Skipping — options not a list of 4: {q.get('question', '?')}")
                continue

            if q["correct_answer"] not in q["options"]:
                print(f"[WARN] Skipping — answer not in options: '{q['correct_answer']}'")
                continue

            if not _answer_grounded_in_context(q["correct_answer"], context):
                print(f"[WARN] Skipping — answer not in patient data (hallucinated): '{q['correct_answer']}' for Q: {q['question']}")
                continue

            if _options_have_duplicates(q["options"]):
                print(f"[WARN] Skipping — options have duplicates/variations: {q['options']}")
                continue

            if _is_near_duplicate_question(q["question"], existing_questions):
                print(f"[WARN] Skipping near-duplicate question: {q['question']}")
                continue

            try:
                gq = GeneratedQuestion.objects.create(
                    profile=profile,
                    question_text=q["question"],
                    options=q["options"],
                    correct_answer=q["correct_answer"],
                    category=q.get("category", "personal"),
                    question_type="mcq",
                )
                all_saved.append(gq)
                existing_questions.append(q["question"])
                new_this_batch += 1
            except Exception as e:
                print(f"[ERROR] Failed to save question: {e}")
                continue

        remaining -= batch_size

        if new_this_batch == 0:
            consecutive_empty_batches += 1
            print(f"[INFO] No valid new questions this batch ({consecutive_empty_batches}/2 empty batches).")
        else:
            consecutive_empty_batches = 0

    print(f"[INFO] Saved {len(all_saved)} total questions for profile {profile.id} "
          f"({len(free_recall_saved)} free-recall, {len(all_saved) - len(free_recall_saved)} MCQ)")
    return all_saved