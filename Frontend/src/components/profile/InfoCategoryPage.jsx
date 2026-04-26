import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, API_BASE } from "../../api";

// ─── Voiceline controls (record + upload + play + delete) ──────────
function VoicelineControls({ field, onChange }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const uploadAudio = async (blob, filename) => {
    setUploading(true);
    setError("");
    try {
      const token = localStorage.getItem("access_token");
      const formData = new FormData();
      formData.append("field", field.id);
      formData.append("audio", blob, filename);

      const res = await fetch(`${API_BASE}/api/voicelines/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await uploadAudio(blob, `voiceline-${field.id}.webm`);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAudio(file, file.name);
    }
    e.target.value = ""; // reset so the same file can be re-picked
  };

  const handleDelete = async () => {
    if (!field.has_voiceline) return;
    if (!window.confirm("Delete this voiceline?")) return;

    try {
      // Find the voiceline id by querying the list
      const res = await apiFetch(`/api/voicelines/?field=${field.id}`);
      if (!res.ok) throw new Error("Could not find voiceline.");
      const list = await res.json();
      const vl = list[0];
      if (!vl) {
        onChange?.();
        return;
      }
      const delRes = await apiFetch(`/api/voicelines/${vl.id}/`, { method: "DELETE" });
      if (!delRes.ok && delRes.status !== 204) {
        throw new Error("Delete failed.");
      }
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const btn = {
    padding: "4px 10px",
    fontSize: "0.72rem",
    fontWeight: 600,
    border: "1px solid #c8b99a",
    borderRadius: 6,
    backgroundColor: "white",
    color: "#1a2744",
    cursor: "pointer",
    transition: "background-color 0.15s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {recording ? (
          <button
            onClick={stopRecording}
            style={{ ...btn, backgroundColor: "#AB0520", color: "white", borderColor: "#AB0520" }}
          >
            ■ Stop
          </button>
        ) : (
          <button onClick={startRecording} disabled={uploading} style={btn}>
            🎙️ Record
          </button>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || recording}
          style={btn}
        >
          📁 Upload audio
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept="audio/*"
          style={{ display: "none" }}
          onChange={handleFilePick}
        />

        {field.has_voiceline && field.voiceline_url && (
          <>
            <audio
              src={field.voiceline_url}
              controls
              style={{ height: 28, maxWidth: 220 }}
            />
            <button
              onClick={handleDelete}
              style={{ ...btn, color: "#AB0520", borderColor: "#e8c0c0" }}
            >
              ✕ Delete
            </button>
          </>
        )}

        {uploading && (
          <span style={{ fontSize: "0.75rem", color: "#6a5a40" }}>Saving...</span>
        )}
        {recording && (
          <span style={{ fontSize: "0.75rem", color: "#AB0520", fontWeight: 600 }}>
            ● Recording
          </span>
        )}
      </div>
      {error && <p style={{ color: "#AB0520", fontSize: "0.75rem", margin: 0 }}>{error}</p>}
    </div>
  );
}

// ─── Main shared page ──────────────────────────────────────────────
export default function InfoCategoryPage({ category, title, subtitle, addPlaceholder }) {
  const { profile, refreshProfile } = useAuth();

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [savedFlash, setSavedFlash] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newError, setNewError] = useState("");

  const loadFields = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/fields/?category=${category}`);
      if (!res.ok) throw new Error("Failed to load fields.");
      const data = await res.json();
      const sorted = [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setFields(sorted);
    } catch (err) {
      console.error(err);
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const handleAnswerChange = (index, value) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, answer: value } : f)));
    setErrors((prev) => ({ ...prev, [index]: null }));
  };

  const handleSaveAll = async () => {
    const newErrors = {};
    fields.forEach((f, i) => {
      if (f.required && !(f.answer || "").trim()) {
        newErrors[i] = "This field is required.";
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      if (!profile?.id) {
        throw new Error("Profile not loaded yet. Please wait a moment and try again.");
      }
      const res = await apiFetch(`/api/profiles/${profile.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save.");
      }
      await refreshProfile();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddNew = async () => {
    setNewError("");
    if (!newTitle.trim()) {
      setNewError("Please add a question or label.");
      return;
    }
    try {
      const res = await apiFetch(`/api/fields/`, {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          answer: newAnswer.trim(),
          category,
          is_custom: true,
          required: false,
          order: fields.length,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to add field.");
      }
      setNewTitle("");
      setNewAnswer("");
      setAdding(false);
      await loadFields();
    } catch (err) {
      setNewError(err.message);
    }
  };

  const handleDeleteCustom = async (field) => {
    if (!field.id) return;
    if (!window.confirm(`Delete "${field.title}"?`)) return;
    try {
      const res = await apiFetch(`/api/fields/${field.id}/`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete field.");
      }
      await loadFields();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f0e8" }}>
        <p style={{ color: "#6a5a40" }}>Loading...</p>
      </div>
    );
  }

  const showVoicelines = category === "family";

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f5f0e8" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#1a2744", fontFamily: "Georgia, serif" }}>
            {title}
          </h1>
          <p className="mt-1" style={{ color: "#6a5a40" }}>
            {subtitle}
          </p>
        </div>

        {fields.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
            <p style={{ color: "#6a5a40" }}>
              No entries yet. Add your first one below.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div
              key={field.id ?? `new-${index}`}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
            >
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold" style={{ color: "#1a2744" }}>
                  {field.title}
                  {field.required && <span style={{ color: "#AB0520" }} className="ml-1">*</span>}
                </label>

                {field.is_custom && (
                  <button
                    onClick={() => handleDeleteCustom(field)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                    title="Delete this field"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <textarea
                rows={2}
                placeholder={field.required ? "Required" : "Optional"}
                value={field.answer || ""}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                className={`w-full text-sm text-gray-700 border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a2744] transition
                  ${errors[index] ? "border-red-400" : "border-gray-200"}`}
              />

              {errors[index] && (
                <p className="text-red-500 text-xs mt-1">{errors[index]}</p>
              )}

              {/* Voiceline controls — only on family page, only on saved fields */}
              {showVoicelines && field.id && (
                <VoicelineControls field={field} onChange={loadFields} />
              )}
            </div>
          ))}
        </div>

        {/* Add new field */}
        {adding ? (
          <div className="mt-4 bg-white rounded-xl border-2 border-[#1a2744] shadow-sm p-5">
            <label className="block text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#AB0520" }}>
              New Question / Label
            </label>
            <input
              type="text"
              placeholder={addPlaceholder}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-[#1a2744]"
            />

            <label className="block text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#AB0520" }}>
              Answer (optional)
            </label>
            <textarea
              rows={2}
              placeholder="You can fill this in now or later"
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a2744]"
            />

            {newError && <p className="text-red-500 text-xs mt-2">{newError}</p>}

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddNew}
                className="flex-1 py-2 bg-[#1a2744] text-white rounded-lg font-semibold hover:bg-[#243660] transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setNewTitle("");
                  setNewAnswer("");
                  setNewError("");
                }}
                className="flex-1 py-2 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                style={{ color: "#6a5a40" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-[#1a2744] hover:text-[#1a2744] transition-colors text-sm"
          >
            + Add a new question
          </button>
        )}

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="mt-3 w-full py-3 bg-[#1a2744] text-white rounded-xl font-semibold hover:bg-[#243660] transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : savedFlash ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}