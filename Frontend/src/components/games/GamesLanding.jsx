import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";

const games = [
  {
    id: "memory-lane",
    title: "Memory Lane",
    desc: "Walk down your memory lane — answer personal questions and unlock your journey, one step at a time.",
    route: "/games/memory-lane",
    icon: (
      <svg viewBox="0 0 48 48" style={{ width: 48, height: 48 }} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" stroke="#AB0520" strokeWidth="2.5" fill="#f5f0e8" />
        <path d="M14 34 C14 22, 20 18, 24 14 C28 18, 34 22, 34 34" stroke="#1a2744" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="16" cy="30" r="2.5" fill="#AB0520" />
        <circle cx="21" cy="24" r="2.5" fill="#AB0520" />
        <circle cx="27" cy="20" r="2.5" fill="#AB0520" />
        <circle cx="32" cy="28" r="2.5" fill="#AB0520" />
      </svg>
    ),
    available: true,
  },
  {
    id: "family-tree",
    title: "Family Tree",
    desc: "Piece together your family tree by naming each member — unlock voice notes left by your loved ones.",
    route: "/games/family-tree",
    icon: (
      <svg viewBox="0 0 48 48" style={{ width: 48, height: 48 }} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="10" r="6" stroke="#1a2744" strokeWidth="2" fill="#f5f0e8" />
        <line x1="24" y1="16" x2="24" y2="24" stroke="#1a2744" strokeWidth="2" />
        <line x1="12" y1="24" x2="36" y2="24" stroke="#1a2744" strokeWidth="2" />
        <line x1="12" y1="24" x2="12" y2="30" stroke="#1a2744" strokeWidth="2" />
        <line x1="24" y1="24" x2="24" y2="30" stroke="#1a2744" strokeWidth="2" />
        <line x1="36" y1="24" x2="36" y2="30" stroke="#1a2744" strokeWidth="2" />
        <circle cx="12" cy="34" r="4" stroke="#AB0520" strokeWidth="2" fill="#f5f0e8" />
        <circle cx="24" cy="34" r="4" stroke="#AB0520" strokeWidth="2" fill="#f5f0e8" />
        <circle cx="36" cy="34" r="4" stroke="#AB0520" strokeWidth="2" fill="#f5f0e8" />
      </svg>
    ),
    available: true,
  },
  {
    id: "memory-quiz",
    title: "Practice Quiz",
    desc: "Freely practice with all your memory questions. No pressure, no tracking — just exercise your memory at your own pace.",
    route: "/games/memory-quiz",
    icon: (
      <svg viewBox="0 0 48 48" style={{ width: 48, height: 48 }} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" stroke="#AB0520" strokeWidth="2.5" fill="#f5f0e8" />
        <text x="24" y="32" textAnchor="middle" fill="#1a2744" fontSize="24" fontFamily="Georgia, serif" fontWeight="bold">?</text>
      </svg>
    ),
    available: true,
  },
  {
    id: "adaptive-quiz",
    title: "Daily Exercise",
    desc: "A personalized quiz that adapts to you — questions you struggle with appear more often to help strengthen your memory.",
    route: "/games/adaptive-quiz",
    icon: (
      <svg viewBox="0 0 48 48" style={{ width: 48, height: 48 }} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" stroke="#AB0520" strokeWidth="2.5" fill="#f5f0e8" />
        <path d="M16 28 L22 22 L26 26 L32 18" stroke="#1a2744" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="18" r="2" fill="#AB0520" />
      </svg>
    ),
    available: true,
  },
];

export default function GamesLanding() {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setGenMessage("");
    try {
      const res = await apiFetch(`/api/questions/generate/`, {
        method: "POST",
        body: JSON.stringify({ desired_total: 18, rebuild_store: true }),
      });
      const data = await res.json();
      setGenMessage(data.message || "Done!");
    } catch (err) {
      setGenMessage("Failed to generate questions.");
    } finally {
      setGenerating(false);
    }
  };

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
        Activities
      </h2>
      <p style={{ color: "#6a5a40", fontSize: "0.95rem", marginBottom: 28 }}>
        Fun activities to exercise your memory and stay connected with loved ones.
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {games.map((game) => (
          <div
            key={game.id}
            onClick={() => game.available && navigate(game.route)}
            style={{
              flex: "1 1 300px",
              maxWidth: 340,
              padding: 24,
              borderRadius: 10,
              backgroundColor: "white",
              border: "1px solid #d4c9b0",
              cursor: game.available ? "pointer" : "default",
              opacity: game.available ? 1 : 0.55,
              transition: "box-shadow 0.2s, transform 0.2s",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              if (game.available) {
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(26,39,68,0.12)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "none";
            }}
          >
            {!game.available && (
              <span
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: "#AB0520",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Coming Soon
              </span>
            )}
            <div style={{ marginBottom: 14 }}>{game.icon}</div>
            <h3
              style={{
                fontFamily: "Georgia, serif",
                color: "#1a2744",
                fontSize: "1.15rem",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {game.title}
            </h3>
            <p style={{ color: "#6a5a40", fontSize: "0.88rem", lineHeight: 1.5, margin: 0 }}>
              {game.desc}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 32,
        padding: 20,
        backgroundColor: "white",
        borderRadius: 10,
        border: "1px solid #d4c9b0",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontFamily: "Georgia, serif", color: "#1a2744", fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>
              Question Bank
            </h3>
            <p style={{ color: "#6a5a40", fontSize: "0.85rem", margin: 0 }}>
              Generate new memory questions from your profile and diary entries.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "10px 24px",
              backgroundColor: generating ? "#6a5a40" : "#AB0520",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: generating ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {generating ? "Generating..." : "Generate Questions"}
          </button>
        </div>
        {genMessage && (
          <p style={{ color: "#1a2744", fontSize: "0.85rem", marginTop: 12, marginBottom: 0 }}>
            {genMessage}
          </p>
        )}
      </div>
    </div>
  );
}
