import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8000";

export default function DiaryPage() {
  const [entries, setEntries] = useState([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // For now, hardcode profile ID 1. Later this comes from auth/context.
  const profileId = 1;

  const fetchEntries = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/diary/?profile=${profileId}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error("Failed to load entries:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/diary/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileId, text: text.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save entry.");
      setText("");
      fetchEntries();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f5f0e8" }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#1a2744", fontFamily: "Georgia, serif" }}>
            Daily Diary
          </h1>
          <p className="mt-1" style={{ color: "#6a5a40" }}>
            Write about what happened today. These entries help build better memory exercises.
          </p>
        </div>

        {/* New Entry */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <textarea
            rows={4}
            placeholder="What happened today? (e.g., 'Went to the doctor to see Dr. Martinez. Had lunch with Maria.')"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a2744] transition"
          />
          <button
            onClick={handleSubmit}
            disabled={saving || !text.trim()}
            className="mt-3 w-full py-3 bg-[#1a2744] text-white rounded-xl font-semibold hover:bg-[#243660] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Entry"}
          </button>
        </div>

        {/* Past Entries */}
        <div>
          <h2 className="text-lg font-bold mb-4" style={{ color: "#1a2744", fontFamily: "Georgia, serif" }}>
            Past Entries
          </h2>

          {loading && <p style={{ color: "#6a5a40" }}>Loading...</p>}

          {!loading && entries.length === 0 && (
            <p style={{ color: "#6a5a40" }}>No diary entries yet. Write your first one above.</p>
          )}

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-3"
            >
              <p className="text-xs font-semibold mb-2" style={{ color: "#AB0520" }}>
                {entry.date}
              </p>
              <p className="text-sm" style={{ color: "#1a2744" }}>
                {entry.text}
              </p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}