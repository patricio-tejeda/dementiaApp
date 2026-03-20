import { useState, useEffect } from "react";

const API_BASE = "http://localhosst:8000"

const DEFUALT_QUESTIONS = [
    {title: "Patient Name", required: true, is_custom: false, order: 1},
    {title: "Patient's Date of Birth", required: true, is_custom: false, order:2},
    {title: "Patient's hometown", required: true, is_custom: false, order:3},
    {title: "Patient's favorite color", required: false, is_custom: false, order:4},
    {title: "Patients' mother's name", required: true, is_custom: false, order:5},
    {title: "Patients' father's name", required: true, is_custom: false, order:6},
    {title: "Patients' mother's birthday", required: false, is_custom: false, order:7},
    {title: "Patients' father's birthday", required: false, is_custom: false, order:8},
    {title: "Number of siblings that the patient has", required: true, is_custom: false, order:9}, // maybe make this one a dropdown option
    {title: "Siblings names", required: false, is_custom: false, order:10}, // make this required if the answer to the previous question was > 0
    {title: "What are the siblings' birthdays?", required: false, is_custom: false, order:11}, // make this requied also if #9 is >0 and make a dropdown so that the names of the siblings have input fields next to them where the bday can be entered
    {title: "Patient's elementary school", required: true, is_custom: false, order:12},
    {title: "Patient's middle school", required: true, is_custom: false, order:13},
    {title: "Patient's high school", required: true, is_custom: false, order:14},
    {title: "Patient's college", required: false, is_custom: false, order:15},
    {title: "Patient's degree title", required: false, is_custom: false, order:16},
];

export default function PatientProfileSetup(){
    const [fields, setFields] = useState(
        DEFUALT_QUESTIONS.map((q) => ({...q, answer: " " }))
    );
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const [savec, setSaved] = useState(false);

    // updating answers
    const handleAnswerChange = (index, value) => {
        setFields((prev) => prev.map((f,i) => (i === index ? {...f, answer: value}: f))); 
        setErrors((prev) =>({ ...prev, [index]: null }));
    };

    const handleTitleChange = (index, value) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, title: value } : f)));
    setErrors((prev) => ({ ...prev, [index]: null }));
  };

  const addCustomField = () => {
    setFields((prev) => [
      ...prev,
      { title: "", answer: "", required: false, is_custom: true, order: prev.length + 1 },
    ]);
  };

  const removeCustomField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validate
    const newErrors = {};
    fields.forEach((f, i) => {
      if (f.required && !f.answer.trim()) {
        newErrors[i] = "This field is required.";
      }
      if (f.is_custom && !f.title.trim()) {
        newErrors[i] = "Please add a label for your custom question.";
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error("Failed to save profile.");
      setSaved(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1a2744] mb-2">Profile Saved!</h2>
          <p className="text-gray-500">The patient's profile has been created successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1a2744]">Patient Profile Setup</h1>
          <p className="text-gray-500 mt-1">
            Fill in what you know. Fields marked with <span className="text-red-500">*</span> are required.
          </p>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
            >
              {/* Label row */}
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

              {/* Answer */}
              <textarea
                rows={2}
                placeholder={field.required ? "Required" : "Optional"}
                value={field.answer}
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

        {/* Add custom field button */}
        <button
          onClick={addCustomField}
          className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-[#1a2744] hover:text-[#1a2744] transition-colors text-sm"
        >
          + Add your own question
        </button>

        {/* Save button */}
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