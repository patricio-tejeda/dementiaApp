import json
from RAG.groq_client import build_chat_groq


SAFE_TOPICS_GUIDANCE = """
SAFETY RULES:
- Never reference death, illness, loss, grief, or anyone who may have passed away.
- Never reference dementia, memory loss, decline, or aging negatively.
- Never give medical advice or specific dosages.
- Never reference money, finances, or worry-inducing topics.
- Tone must be warm, gentle, and present-focused — like a caring companion.
- Use simple, short sentences. Avoid complex grammar.
"""


def generate_wellness_prompts(personal_fields, family_fields, diary_entries, count: int = 30) -> list[dict]:
    """
    Generate personalized wellness prompts for a dementia patient.
    Returns a list of {"icon": str, "text": str} dicts.
    Falls back to an empty list on any failure (frontend will still have hardcoded prompts).
    """

    # Compact the patient's data into a short context block
    facts = []
    for f in personal_fields:
        title = (f.get("title") or "").strip()
        answer = (f.get("answer") or "").strip()
        if title and answer:
            facts.append(f"{title}: {answer}")
    for f in family_fields:
        title = (f.get("title") or "").strip()
        answer = (f.get("answer") or "").strip()
        if title and answer:
            facts.append(f"{title}: {answer}")

    diary_snippets = []
    for entry in diary_entries:
        if entry.get("quality") == "rich":
            text = (entry.get("text") or "").strip()
            if text and len(text) <= 200:
                diary_snippets.append(text)

    if not facts and not diary_snippets:
        # Nothing to personalize on
        return []

    facts_text = "\n".join(f"- {fact}" for fact in facts) if facts else "(none)"
    diary_text = "\n".join(f"- {snip}" for snip in diary_snippets[:8]) if diary_snippets else "(none)"

    prompt = f"""You are creating gentle wellness reminders and warm memory prompts for a person living with dementia.
Write like a kind friend or caregiver — soft, supportive, present-focused.

{SAFE_TOPICS_GUIDANCE}

Patient information you can reference:
{facts_text}

Recent diary moments you can gently echo:
{diary_text}

TASK: Create {count} short, varied prompts. Mix these styles:
- Gentle wellness check-ins (water, food, fresh air, stretching, rest)
- Warm memory invitations grounded in the patient's actual facts above
- Sensory grounding ("notice something blue near you")
- Light, joyful suggestions (a favorite song, a warm drink)

RULES:
1. Each prompt MUST be one or two short sentences. Maximum 25 words.
2. Each prompt must include a single emoji that fits the message.
3. NEVER mention dementia, memory loss, illness, or anyone who might be deceased.
4. NEVER repeat the same prompt twice.
5. Use the patient's specific facts when possible (their hometown, school, favorite color, family names).
6. Address the patient warmly in second person ("you", "your").

Respond with ONLY a JSON array. No prose, no markdown fences. Each item must be:
{{"icon": "<single emoji>", "text": "<the prompt>"}}

Generate {count} prompts now."""

    try:
        llm = build_chat_groq("llama-3.3-70b-versatile")
        response = llm.invoke(prompt)
        raw = response.content.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        data = json.loads(raw)
        if not isinstance(data, list):
            return []

        cleaned = []
        seen_texts = set()
        for item in data:
            if not isinstance(item, dict):
                continue
            icon = (item.get("icon") or "").strip()
            text = (item.get("text") or "").strip()
            if not icon or not text:
                continue
            if text.lower() in seen_texts:
                continue
            seen_texts.add(text.lower())
            cleaned.append({"icon": icon, "text": text})

        return cleaned

    except Exception as exc:
        print(f"[WARN] Wellness prompt generation failed: {exc}")
        return []