import os
import json
import re
from RAG.vector_database import VectorStore
from RAG.diary_classifier import classify_diary_entry
from RAG.groq_client import build_chat_groq

def load_guidelines():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, "nacc_guidelines.json")

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

guidelines = load_guidelines()

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

def _caregiver_style_question(question: str) -> str:
    """
    Keep the question short, warm, and supportive.
    This is a lightweight formatter until we plug in a caregiver-style dataset.
    """
    text = re.sub(r"\s+", " ", (question or "")).strip()
    text = re.sub(r"^(what|which|who|where)\s+", lambda m: m.group(1).capitalize() + " ", text, flags=re.I)
    if not text.endswith("?"):
        text = text.rstrip(".") + "?"

    # Keep concrete memory cues, but avoid abrupt quiz-like phrasing.
    lowered = text.lower()
    if lowered.startswith("what is your") or lowered.startswith("what's your"):
        text = re.sub(r"^what(?: is|'s) your\s+", "Can you tell me your ", text, flags=re.I)
        if not text.endswith("?"):
            text += "?"
    elif lowered.startswith("who is your"):
        text = re.sub(r"^who is your\s+", "Can you tell me who your ", text, flags=re.I)
        if not text.endswith("?"):
            text += "?"

    return text

def _evaluate_caregiver_tone(question: str) -> tuple[int, str]:
    """
    Lightweight, explainable tone score (0-100) for caregiver communication.
    This is a baseline until we compare against a curated caregiver dataset.
    """
    text = re.sub(r"\s+", " ", (question or "")).strip()
    lowered = text.lower()
    score = 100
    notes = []

    # Penalize harsh, testing language.
    harsh_markers = ["test", "quiz", "prove", "fail", "wrong answer", "must"]
    for marker in harsh_markers:
        if marker in lowered:
            score -= 15
            notes.append(f"contains harsh/test phrasing ('{marker}')")

    # Encourage supportive caregiving cues.
    supportive_markers = ["let's", "can you", "tell me", "together", "remember"]
    if not any(marker in lowered for marker in supportive_markers):
        score -= 12
        notes.append("missing supportive caregiver cue")

    # Keep language simple: shorter questions are generally easier.
    word_count = len(text.split())
    if word_count > 18:
        score -= 8
        notes.append("question may be too long for easy recall")

    # Avoid stacked questions.
    if text.count("?") > 1:
        score -= 10
        notes.append("contains multiple question clauses")

    score = max(0, min(100, score))
    if not notes:
        notes.append("tone aligns with supportive caregiver style")
    return score, "; ".join(notes)


def _build_context(profile, store: VectorStore | None = None) -> str:
    if store is None:
        store = VectorStore("faiss_store")
        store.load()

    from core.models import DiaryEntry

    queries = [
        "patient personal information name birthday hometown",
        "patient family mother father siblings spouse children",
        "patient education school college degree occupation",
        "patient favorite things preferences colors food hobbies",
    ]

    all_context = []
    for q in queries:
        results = store.query(q, top_k=3)
        for r in results:
            text = r["metadata"].get("text", "") if r["metadata"] else ""
            if text and text not in all_context:
                all_context.append(text)

    diary_entries = DiaryEntry.objects.filter(profile=profile, quality="rich")
    for entry in diary_entries:
        tagged = f"Diary entry: {entry.text}"
        if tagged not in all_context:
            all_context.append(tagged)
        if entry.enrichment:
            enriched = f"Diary follow-up: {entry.enrichment}"
            if enriched not in all_context:
                all_context.append(enriched)

    return "\n\n".join(all_context)


def reword_question_for_retry(profile, question, wrong_answers: list[str] | None = None) -> str:
    """
    Rephrase a question so it asks about the same fact in a gentler, more helpful way.
    Used for adaptive reprompts while keeping the same underlying answer target.
    """
    wrong_answers = [a for a in (wrong_answers or []) if a]

    try:
        store = VectorStore("faiss_store")
        store.load()
        context = _build_context(profile, store=store)
        llm = build_chat_groq("llama-3.3-70b-versatile")
    except Exception as exc:
        print(f"[WARN] Failed to prepare reworded question context: {exc}")
        return _caregiver_style_question(question.question_text)

    wrong_summary = ", ".join(wrong_answers[:3]) if wrong_answers else "None recorded"
    prompt = f"""You are helping a dementia patient practice a memory question they previously struggled with.
Rewrite the question so it asks about the SAME fact, but in a fresh, gentle, caregiver-style way.

RULES:
1. Ask about the exact same fact as the original question.
2. Do not reveal or hint at the correct answer.
3. Keep it to one short sentence.
4. Use warm, supportive language.
5. Avoid repeating the original wording too closely.
6. Return ONLY the rewritten question text.

Patient information:
{context}

Original question:
{question.question_text}

Correct answer:
{question.correct_answer}

Options:
{json.dumps(question.options or [])}

Common incorrect answers chosen before:
{wrong_summary}
"""

    try:
        response = llm.invoke(prompt)
        rewritten = _caregiver_style_question(response.content.strip().strip('"'))
        if rewritten:
            return rewritten
    except Exception as exc:
        print(f"[WARN] Failed to generate reworded question: {exc}")

    return _caregiver_style_question(question.question_text)


def generate_questions_for_profile(profile, count=5):
    """Generate structured MCQ + free-recall questions from profile + diary data."""

    store = VectorStore("faiss_store")
    store.load()

    llm = build_chat_groq("llama-3.3-70b-versatile")

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
    context_parts = []
    base_context = _build_context(profile, store=store)
    if base_context:
        context_parts.append(base_context)

    for diary_text in rich_diary_texts:
        tagged = f"Diary entry: {diary_text}"
        if tagged not in context_parts:
            context_parts.append(tagged)

    context = "\n\n".join(part for part in context_parts if part)

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
    max_batches = max(3, count * 2)
    batches_run = 0

    while remaining > 0 and consecutive_empty_batches < 3 and batches_run < max_batches:
        batches_run += 1
        batch_size = min(remaining, 5)

        retry_list = []
        prompt = f"""You are creating memory exercise multiple-choice questions for a dementia patient.
Write like a calm caregiver: warm, respectful, and supportive.
Use short, clear, everyday language. Avoid harsh test-like wording.

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

STRICT JSON REQUIREMENTS:
- Output must be valid JSON that can be parsed by Python json.loads()
- All keys MUST use double quotes
- All string values MUST use double quotes
- Do NOT output unquoted text
- Do NOT include trailing commas
- Do NOT include markdown (no ``` blocks)
- If unsure, return []
8. Caregiver tone requirements for each question:
   - Keep wording gentle and encouraging.
   - Do NOT use negative/judgmental phrasing.
   - Keep each question to one sentence.
9. RETRY LOGIC (VERY IMPORTANT):
   - If a topic appears in the Existing Questions list, you MAY generate a follow-up question ONLY IF it is clearly a retry for a previously missed question.
   - A retry question must:
       * Ask about the SAME underlying fact (same correct answer),
       * Use DIFFERENT wording (not just minor rephrasing),
       * Sound natural and supportive, like helping the patient try again.
   - Do NOT repeat the exact same wording.
   - Do NOT create multiple retries for the same question in this batch.
   - If you are unsure, choose a completely new topic instead.

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

Retry Questions (only rephrase if listed here):
{retry_list}

Patient Information (ONLY use facts stated here):
{context}

Memory Guidance (use this to shape question themes):

Family Memory:
{guidelines.get('family', '')}

Childhood Memory:
{guidelines.get('childhood', '')}

Life Events:
{guidelines.get('life_events', '')}

Daily Life Memory:
{guidelines.get('daily_memory', '')}

Emotional Memory:
{guidelines.get('emotional_memory', '')}

Each JSON item must have:
- "question": the question text
- "options": array of exactly 4 DISTINCT choices of the same type
- "correct_answer": exact copy of one option, which must also appear in the Patient Information
- "category": one of "personal", "family", "education", "diary"

Generate {batch_size} NEW questions grounded strictly in the Patient Information above. Return ONLY the JSON array."""

        response = llm.invoke(prompt)
        raw = response.content.strip()

# ================= DEBUG OUTPUT =================
        print("\n[DEBUG] Batch size:", batch_size)
        print("[DEBUG] Remaining questions:", remaining)
        print("\n================ RAW LLM OUTPUT ================\n")
        print(raw[:2000])
        print("\n================================================\n")
# ================================================

        if raw.startswith("```"):
            raw = raw.replace("```json", "").replace("```", "").strip()
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

            styled_question = _caregiver_style_question(q["question"])

            if _is_near_duplicate_question(styled_question, existing_questions):
                print(f"[WARN] Skipping near-duplicate question: {styled_question}")
                continue

            try:
                tone_score, tone_notes = _evaluate_caregiver_tone(styled_question)
                gq = GeneratedQuestion.objects.create(
                    profile=profile,
                    question_text=styled_question,
                    options=q["options"],
                    correct_answer=q["correct_answer"],
                    category=q.get("category", "personal"),
                    question_type="mcq",
                    tone_score=tone_score,
                    tone_notes=tone_notes,
                )
                all_saved.append(gq)
                existing_questions.append(styled_question)
                new_this_batch += 1
            except Exception as e:
                print(f"[ERROR] Failed to save question: {e}")
                continue

        if new_this_batch == 0:
            consecutive_empty_batches += 1
            print(f"[INFO] No valid new questions this batch ({consecutive_empty_batches}/3 empty batches).")
        else:
            remaining -= new_this_batch
            consecutive_empty_batches = 0

    print(f"[INFO] Saved {len(all_saved)} total questions for profile {profile.id} "
          f"({len(free_recall_saved)} free-recall, {len(all_saved) - len(free_recall_saved)} MCQ)")
    return all_saved
