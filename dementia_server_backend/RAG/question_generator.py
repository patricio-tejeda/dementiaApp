import os
import json
from langchain_groq import ChatGroq
from RAG.vector_database import VectorStore
from dotenv import load_dotenv

load_dotenv()


def generate_questions_for_profile(profile, count=5):
    """Generate structured MCQ questions from a patient's profile + diary data."""

    # Load vector store
    store = VectorStore("faiss_store")
    store.load()

    # Init LLM
    groq_api_key = os.getenv("GROQ_API_KEY")
    llm = ChatGroq(groq_api_key=groq_api_key, model_name="llama-3.1-8b-instant")

    # Build a list of queries to pull diverse context
    queries = [
        "patient personal information name birthday hometown",
        "patient family mother father siblings",
        "patient education school college",
        "what did the patient do recently diary",
        "patient favorite things preferences",
    ]

    # Gather context from vector store
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

    prompt = f"""You are helping create memory exercises for a dementia patient.

Based on the patient information below, generate exactly {count} multiple choice questions.
Each question should test the patient's memory about their own life.

CRITICAL RULES:
1. The "correct_answer" MUST be copied exactly from one of the "options" — same spelling, same capitalization, same wording. Do NOT abbreviate or rephrase it.
2. Each question must have exactly 4 options.
3. Respond with ONLY a JSON array, no other text.

Each item must have exactly these fields:
- "question": the question text
- "options": array of exactly 4 answer choices
- "correct_answer": MUST be an exact copy of one of the options
- "category": one of "personal", "family", "education", "diary"

Example format:
[
  {{
    "question": "What is your mother's name?",
    "options": ["Sarah", "Alma", "Maria", "Jane"],
    "correct_answer": "Alma",
    "category": "family"
  }}
]

Patient information:
{context}

Generate {count} questions now. Return ONLY the JSON array."""

    response = llm.invoke(prompt)
    raw = response.content.strip()

    # Clean up response — remove markdown fences if present
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
        return []

    # Save to database
    from core.models import GeneratedQuestion

    saved = []
    for q in questions_data:
        # Verify correct_answer matches an option exactly
        if q["correct_answer"] not in q["options"]:
            print(f"[WARN] Skipping question — correct_answer '{q['correct_answer']}' not in options {q['options']}")
            continue

        try:
            gq = GeneratedQuestion.objects.create(
                profile=profile,
                question_text=q["question"],
                options=q["options"],
                correct_answer=q["correct_answer"],
                category=q.get("category", "personal"),
            )
            saved.append(gq)
        except Exception as e:
            print(f"[ERROR] Failed to save question: {e}")
            continue

    print(f"[INFO] Saved {len(saved)} questions for profile {profile.id}")
    return saved