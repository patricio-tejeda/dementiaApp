import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../api";

export default function PatientProfileSetup() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);

  // Load fields from the user's existing (backend-seeded) profile
  useEffect(() => {
    let mounted = true;

    async function ensureProfileLoaded() {
      if (profile) {
        const sortedExisting = [...(profile.fields || [])].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        );
        if (mounted) {
          setFields(sortedExisting);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const loadedProfile = await refreshProfile();
      if (!mounted) return;

      if (!loadedProfile) {
        setFields([]);
        setLoading(false);
        return;
      }

      const sorted = [...(loadedProfile.fields || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      setFields(sorted);
      setLoading(false);
    }

    ensureProfileLoaded();
    return () => {
      mounted = false;
    };
  }, [profile, refreshProfile]);

  const handleAnswerChange = (index, value) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, answer: value } : f)));
    setErrors((prev) => ({ ...prev, [index]: null }));
  };

  const handleTitleChange = (index, value) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, title: value } : f)));
    setErrors((prev) => ({ ...prev, [index]: null }));
  };

  const addCustomField = () => {
    setFields((prev) => [
      ...prev,
      {
        title: "",
        answer: "",
        required: false,
        is_custom: true,
        is_generated: false,
        order: prev.length + 1,
      },
    ]);
  };

  const removeCustomField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const addAIFields = async () => {
    if (!profile?.id || generating) return;

    setGenerating(true);
    try {
      const res = await apiFetch(`/api/profiles/${profile.id}/generate_followups/`, {
        method: "POST",
        body: JSON.stringify({ count: 5 }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to generate profile questions.");
      }

      const data = await res.json();
      const suggestions = Array.isArray(data.questions) ? data.questions : [];
      if (suggestions.length === 0) {
        alert("No new profile questions were suggested right now. Try again after adding a bit more profile information.");
        return;
      }

      setFields((prev) => {
        const existingTitles = new Set(prev.map((f) => (f.title || "").trim().toLowerCase()));
        const toAdd = suggestions
          .filter((title) => title && !existingTitles.has(title.trim().toLowerCase()))
          .map((title, idx) => ({
            title: title.trim(),
            answer: "",
            required: false,
            is_custom: false,
            is_generated: true,
            order: prev.length + idx + 1,
          }));
        return [...prev, ...toAdd];
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    const newErrors = {};
    fields.forEach((f, i) => {
      if (f.required && !(f.answer || "").trim()) {
        newErrors[i] = "This field is required.";
      }
      if (f.is_custom && !(f.title || "").trim()) {
        newErrors[i] = "Please add a label for your custom question.";
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

      // PATCH the existing profile with updated fields
      const res = await apiFetch(`/api/profiles/${profile.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save profile.");
      }
      await refreshProfile();
      setSaved(true);
      // Redirect to home after short delay so the "saved" screen is visible
      setTimeout(() => navigate("/"), 1200);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1a2744] mb-2">Preparing profile setup...</h2>
          <p className="text-gray-500">Please wait while we load your profile questions.</p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1a2744] mb-2">Profile Saved!</h2>
          <p className="text-gray-500">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1a2744]">Patient Profile Setup</h1>
          <p className="text-gray-500 mt-1">
            Fill in what you know. Fields marked with <span className="text-red-500">*</span> are required.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div
              key={field.id ?? `new-${index}`}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
            >
              <div className="flex justify-between items-center mb-2">
                {field.is_custom ? (
                  <input
                    type="text"
                    placeholder="Your question label..."
                    value={field.title}
                    onChange={(e) => handleTitleChange(index, e.target.value)}
                    className="flex-1 text-sm font-semibold text-[#1a2744] border-b-2 border-gray-300 focus:border-[#1a2744] outline-none pb-1 mr-3 bg-transparent"
                  />
                ) : (
                  <label className="text-sm font-semibold text-[#1a2744]">
                    {field.title}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                )}

                {field.is_custom && (
                  <button
                    onClick={() => removeCustomField(index)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
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
            </div>
          ))}
        </div>

        <button
          onClick={addCustomField}
          className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-[#1a2744] hover:text-[#1a2744] transition-colors text-sm"
        >
          + Add your own question
        </button>

        <button
          onClick={addAIFields}
          disabled={generating}
          className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-[#1a2744] hover:text-[#1a2744] transition-colors text-sm"
        >
          {generating ? "Generating questions..." : "+ Generate more questions"}
        </button>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="mt-3 w-full py-3 bg-[#1a2744] text-white rounded-xl font-semibold hover:bg-[#243660] transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}
