import json
from RAG.groq_client import build_chat_groq


def classify_diary_entry(entry_text: str) -> dict:
    """
    Classify a diary entry into one of three buckets:
      - "low":    nonsense, word spam, too short to use (e.g. "hi", "asdf")
      - "sparse": valid but too vague for an MCQ (e.g. "went to the doctor")
      - "rich":   contains concrete details usable for an MCQ
                  (e.g. "Went to Olive Garden with Sarah and got the lasagna")

    Returns:
        {
          "quality": "low" | "sparse" | "rich",
          "followup_prompt": str | None   # only set when quality == "sparse"
        }
    """

    text = (entry_text or "").strip()

    # Cheap pre-filter: anything under 4 chars is obviously low quality,
    # skip the LLM call entirely.
    if len(text) < 4:
        return {"quality": "low", "followup_prompt": None}

    llm = build_chat_groq("llama-3.3-70b-versatile")

    prompt = f"""You are triaging a diary entry written by a dementia patient. Classify it into exactly one of three categories.

CATEGORIES:
- "low":    Nonsense, random characters, word spam, greetings with no content, or anything too short to be a real memory. Examples: "hi", "asdf", "ok", "test", "hello there".
- "sparse": A real event but too vague to build a multiple choice question around. The entry mentions an activity but lacks specific names, places, foods, or people. Examples: "went to the doctor", "ate at a restaurant", "saw a movie", "had a good day".
- "rich":   Contains at least one specific detail: a proper noun (person's name, restaurant name, city), a specific item (food ordered, movie title), or a concrete descriptive fact. Examples: "Went to Olive Garden with Sarah and got the lasagna", "Watched The Godfather with my son Mike", "Dr. Patel said my blood pressure was good".

RULES:
1. If the entry is "sparse", generate ONE natural follow up question that would turn it into a rich entry. The question should ask for the missing specific detail.
   - "went to the doctor"       -> "What did you go to the doctor for?"
   - "ate at a restaurant"      -> "Which restaurant did you eat at?"
   - "saw a movie"              -> "What movie did you see?"
2. If the entry is "low" or "rich", set followup_prompt to null.
3. Respond with ONLY a JSON object. No markdown, no prose.

Diary entry:
"{text}"

Respond with JSON in this exact shape:
{{"quality": "low" | "sparse" | "rich", "followup_prompt": "..." or null}}"""

    response = llm.invoke(prompt)
    raw = response.content.strip()

    # Strip code fences if the model adds them despite instructions
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[WARN] diary_classifier: bad JSON, defaulting to 'low'. Error: {e}")
        print(f"[DEBUG] Raw response: {raw[:300]}")
        return {"quality": "low", "followup_prompt": None}

    quality = data.get("quality")
    if quality not in ("low", "sparse", "rich"):
        print(f"[WARN] diary_classifier: unexpected quality '{quality}', defaulting to 'low'.")
        return {"quality": "low", "followup_prompt": None}

    followup = data.get("followup_prompt")
    if quality != "sparse":
        followup = None
    elif not followup or not isinstance(followup, str):
        # Sparse but no follow up was generated. Fall back to a generic probe
        # rather than losing the entry.
        followup = "Can you tell me more about what happened?"

    return {"quality": quality, "followup_prompt": followup}
