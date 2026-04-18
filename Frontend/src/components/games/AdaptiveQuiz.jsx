import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:8000";

export default function AdaptiveQuiz() {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const profileId = 1;
  const questionCount = 5;

  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch(`${API_BASE}/api/questions/adaptive/?profile=${profileId}&count=${questionCount}`);
        if (!res.ok) throw new Error("Failed to load questions.");
        const data = await res.json();
        if (data.length === 0 || data.error) {
          setError(data.error || "No questions available yet. Please generate questions first.");
        } else {
          setQuestions(data);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  const handleSelect = async (option) => {
    if (showResult) return;
    setSelected(option);
    setShowResult(true);

    const isCorrect = option === questions[current].correct_answer;
    if (isCorrect) setScore((s) => s + 1);

    // Record attempt
    try {
      await fetch(`${API_BASE}/api/attempts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questions[current].id,
          selected_answer: option,
        }),
      });
    } catch (err) {
      console.error("Failed to record attempt:", err);
    }
  };

  const handleNext = () => {
    if (current + 1 >= questions.length) {
      setFinished(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setShowResult(false);
    }
  };

  const handleRestart = () => {
    setLoading(true);
    setFinished(false);
    setCurrent(0);
    setSelected(null);
    setShowResult(false);
    setScore(0);
    // Re-fetch — adaptive endpoint will re-rank based on new attempts
    fetch(`${API_BASE}/api/questions/adaptive/?profile=${profileId}&count=${questionCount}`)
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f0e8" }}>
        <p style={{ color: "#6a5a40" }}>Loading your personalized quiz...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f0e8" }}>
        <p style={{ color: "#AB0520" }}>{error}</p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f0e8" }}>
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ color: "#1a2744", fontFamily: "Georgia, serif" }}>
            Daily Exercise Complete!
          </h2>
          <p className="text-xl mb-2" style={{ color: "#1a2744" }}>
            You scored <strong>{score}</strong> out of <strong>{questions.length}</strong>
          </p>
          <p className="mb-6" style={{ color: "#6a5a40" }}>
            {score === questions.length
              ? "Perfect! Your memory is sharp today!"
              : score >= questions.length / 2
              ? "Good work! The questions you missed will come back to help you practice."
              : "Don't worry — we'll focus on the tricky ones next time."}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleRestart}
              className="px-8 py-3 bg-[#1a2744] text-white rounded-xl font-semibold hover:bg-[#243660] transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate("/games")}
              className="px-8 py-3 border-2 border-[#1a2744] text-[#1a2744] rounded-xl font-semibold hover:bg-[#1a2744] hover:text-white transition-colors"
            >
              Back to Games
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f5f0e8" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#AB0520" }}>
            Daily Exercise
          </p>
          <p className="text-sm font-semibold" style={{ color: "#AB0520" }}>
            Score: {score}
          </p>
        </div>

        <div className="flex justify-between items-center mb-6">
          <p className="text-sm font-semibold" style={{ color: "#6a5a40" }}>
            Question {current + 1} of {questions.length}
          </p>
        </div>

        <div className="w-full h-2 rounded-full mb-8" style={{ backgroundColor: "#d4c9b0" }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${((current + 1) / questions.length) * 100}%`,
              backgroundColor: "#AB0520",
            }}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold mb-6" style={{ color: "#1a2744", fontFamily: "Georgia, serif" }}>
            {q.question_text}
          </h2>

          <div className="flex flex-col gap-3">
            {q.options.map((option, i) => {
              let bgColor = "white";
              let borderColor = "#d4c9b0";
              let textColor = "#1a2744";

              if (showResult) {
                if (option === q.correct_answer) {
                  bgColor = "#d4edda";
                  borderColor = "#28a745";
                } else if (option === selected && option !== q.correct_answer) {
                  bgColor = "#f8d7da";
                  borderColor = "#dc3545";
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(option)}
                  disabled={showResult}
                  className="text-left px-5 py-4 rounded-xl text-sm font-medium transition-all border-2"
                  style={{
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                    color: textColor,
                    cursor: showResult ? "default" : "pointer",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {showResult && (
          <div className="text-center">
            <p className="text-lg font-semibold mb-4" style={{
              color: selected === q.correct_answer ? "#28a745" : "#dc3545"
            }}>
              {selected === q.correct_answer
                ? "Correct! Well done!"
                : `Not quite. The answer is: ${q.correct_answer}`}
            </p>
            <button
              onClick={handleNext}
              className="px-8 py-3 bg-[#AB0520] text-white rounded-xl font-semibold hover:bg-[#8a0418] transition-colors"
            >
              {current + 1 >= questions.length ? "See Results" : "Next Question"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}