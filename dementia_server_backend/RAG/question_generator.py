import os
import json
from langchain_groq import ChatGroq
from RAG.vector_database import VectorStore
from dotenv import load_dotenv

load_dotenv()


def generate_questions_for_profile(profile, count=5):
    """Generate structured MCQ questions from a patient's profile + diary data."""

    store = VectorStore("faiss_store")
    store.load()

    groq_api_key = os.getenv("GROQ_API_KEY")
    llm = ChatGroq(groq_api_key=groq_api_key, model_name="llama-3.1-8b-instant")

    queries = [
        "patient personal information name birthday hometown",
        "patient family mother father siblings",
        "patient education school college",
        "what did the patient do recently diary",
        "patient favorite things preferences",
    ]

    all_context = []
    for q in queries:
        results = store.query(q, top_k=3)
        for r in results:
            text = r["metadata"].get("text", "") if r["metadata"] else ""
            if text and text not in all_context:
                all_context.append(text)

    context = "\n\n".join(all_context)

    if not context:
        print("[WARN] No context found in vector store.")
        return []

    from core.models import GeneratedQuestion
    existing_questions = list(
        GeneratedQuestion.objects.filter(profile=profile).values_list('question_text', flat=True)
    )
    existing_list = "\n".join(f"- {q}" for q in existing_questions) if existing_questions else "None yet."

    all_saved = []
    remaining = count

    while remaining > 0:
        batch_size = min(remaining, 5)

        prompt = f"""You are creating memory exercise questions for a dementia patient based on facts about their life.

RULES:
1. Only create questions where the answer is a SPECIFIC FACT like a name, place, color, or school. NEVER ask about dates, times, or "when" something happened.
2. The "correct_answer" must be copied EXACTLY from one of the "options" — same spelling, capitalization, and wording.
3. All 4 options must be the same type of thing (4 names, 4 colors, 4 places, etc).
4. Every question must be about a DIFFERENT topic. Do not ask two questions about the same subject.
5. Do NOT create questions about vague diary entries. Only use diary entries that mention specific names, places, or activities.
6. Respond with ONLY a JSON array.

BAD questions (never create these):
- "What date did you visit the doctor?" — dates are bad for memory exercises
- "When was your last appointment?" — asking "when" is not helpful
- "What did you do recently?" — too vague

GOOD questions (create these):
- "What is your mother's name?" — tests a specific fact
- "What city did you grow up in?" — tests a specific place
- "What was your favorite color?" — tests a specific preference
- "What elementary school did you attend?" — tests a specific name

Do NOT repeat or rephrase any of these existing questions:
{existing_list}

Each item must have:
- "question": the question text
- "options": array of exactly 4 choices
- "correct_answer": exact copy of one option
- "category": one of "personal", "family", "education", "diary"

Patient information:
{context}

Generate {batch_size} NEW questions. Return ONLY the JSON array."""

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
            if q["correct_answer"] not in q["options"]:
                print(f"[WARN] Skipping — answer mismatch: '{q['correct_answer']}'")
                continue

            new_text = q["question"].lower().strip()
            is_duplicate = False
            for existing in existing_questions:
                if existing.lower().strip() == new_text:
                    is_duplicate = True
                    break
            if is_duplicate:
                print(f"[WARN] Skipping duplicate: {q['question']}")
                continue

            try:
                gq = GeneratedQuestion.objects.create(
                    profile=profile,
                    question_text=q["question"],
                    options=q["options"],
                    correct_answer=q["correct_answer"],
                    category=q.get("category", "personal"),
                )
                all_saved.append(gq)
                existing_questions.append(q["question"])
                new_this_batch += 1
            except Exception as e:
                print(f"[ERROR] Failed to save question: {e}")
                continue

        remaining -= batch_size

        # If LLM produced nothing useful this batch, stop trying
        if new_this_batch == 0:
            print("[INFO] LLM produced no valid new questions this batch. Stopping.")
            break

    print(f"[INFO] Saved {len(all_saved)} questions for profile {profile.id}")
    return all_saved