import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../api";

// ─── Hardcoded fallback prompts ──────────────────────────────────────
// These always exist as a baseline. LLM-generated prompts get mixed in.
const FALLBACK_PROMPTS = [
  { icon: "💧", text: "Have you had some water today? A small glass can do wonders." },
  { icon: "🍽️", text: "Have you eaten something today? Even a small snack helps." },
  { icon: "🌞", text: "Try stepping outside for a moment of fresh air and sunshine." },
  { icon: "🧘", text: "Take a deep breath. Inhale slowly, exhale slowly. You're doing great." },
  { icon: "🚶", text: "A short walk can lift your spirits. Even just around the room." },
  { icon: "🎵", text: "Music can bring back warm memories. What's a favorite song of yours?" },
  { icon: "💤", text: "Rest is important. If you feel tired, it's okay to take a break." },
  { icon: "🌸", text: "Notice something small and beautiful around you right now." },
  { icon: "✋", text: "Stretch your arms up high, then let them rest. Gentle movement feels good." },
  { icon: "🤗", text: "You are loved. You matter. Today is a good day to be kind to yourself." },
  { icon: "☕", text: "A warm drink — tea, coffee, or cocoa — can be a comforting little ritual." },
  { icon: "📝", text: "Writing in your diary can help you remember the good moments of today." },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Main Component ──────────────────────────────────────────────────
export default function WellnessPage() {
  const { user } = useAuth();
  const [llmPrompts, setLlmPrompts] = useState([]);
  const [loadingLlm, setLoadingLlm] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  // Fetch personalized prompts from the LLM endpoint once per page load
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoadingLlm(true);
      try {
        const res = await apiFetch(`/api/wellness/prompts/?count=30`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.prompts)) {
            setLlmPrompts(data.prompts);
          }
        }
      } catch (err) {
        console.error("Wellness prompt load failed:", err);
      } finally {
        if (mounted) setLoadingLlm(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Final rotation: LLM prompts + fallback prompts, deduplicated, shuffled
  const allPrompts = useMemo(() => {
    const combined = [...llmPrompts, ...FALLBACK_PROMPTS];
    const seen = new Set();
    const unique = [];
    for (const p of combined) {
      const key = (p.text || "").toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    return shuffle(unique);
  }, [llmPrompts]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % allPrompts.length);
    setFadeKey((k) => k + 1);
  }, [allPrompts.length]);

  if (loadingLlm && llmPrompts.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: "60px auto 0", textAlign: "center", color: "#6a5a40" }}>
        Preparing your wellness reminders...
      </div>
    );
  }

  if (allPrompts.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: "60px auto 0", textAlign: "center", color: "#6a5a40" }}>
        No wellness prompts available yet.
      </div>
    );
  }

  const prompt = allPrompts[currentIndex];
  const greeting = user?.full_name
    ? `Hi, ${user.full_name.split(" ")[0]}.`
    : "Hi there.";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", paddingTop: 12 }}>
      <h2
        style={{
          fontFamily: "Georgia, serif",
          color: "#1a2744",
          fontSize: "1.6rem",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Wellness
      </h2>
      <p style={{ color: "#6a5a40", fontSize: "0.95rem", marginBottom: 28 }}>
        Gentle reminders and little memories to brighten your day.
      </p>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          border: "1px solid #d4c9b0",
          padding: "44px 36px",
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(26,39,68,0.04)",
        }}
      >
        <p
          style={{
            fontFamily: "Georgia, serif",
            color: "#AB0520",
            fontSize: "0.9rem",
            fontWeight: 600,
            marginBottom: 16,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {greeting}
        </p>

        <div
          key={fadeKey}
          style={{
            animation: "wellnessFade 0.4s ease",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: 16, lineHeight: 1 }}>
            {prompt.icon}
          </div>
          <p
            style={{
              fontFamily: "Georgia, serif",
              color: "#1a2744",
              fontSize: "1.25rem",
              lineHeight: 1.5,
              fontWeight: 500,
              margin: 0,
              maxWidth: 560,
            }}
          >
            {prompt.text}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        <button
          onClick={handleNext}
          style={{
            padding: "12px 40px",
            backgroundColor: "#AB0520",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
            letterSpacing: "0.05em",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#8a0418")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#AB0520")}
        >
          Next Reminder →
        </button>
      </div>

      <style>{`
        @keyframes wellnessFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}