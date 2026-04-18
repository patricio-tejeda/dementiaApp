import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8000";

export default function MemoryQuiz() {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const profileId = 1;

  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch(`${API_BASE}/api/questions/?profile=${profileId}`);
        if (!res.ok) throw new Error("Failed to load questions.");
        const data = await res.json();
        if (data.length === 0) {
          setError("No questions available yet. Please generate questions first.");
        }
        setQuestions(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  const handleSelect = (option) => {
    if (showResult) return;
    setSelected(option);
    setShowResult(true);
    if (option === questions[current].correct_answer) {
      setScore((s) => s + 1);
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
    setCurrent(0);
    setSelected(null);
    setShowResult(false);
    setScore(0);
    setFinished(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f0e8" }}>
        <p style={{ color: "#6a5a40" }}>Loading questions...</p>
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
            Quiz Complete!
          </h2>
          <p className="text-xl mb-2" style={{ color: "#1a2744" }}>
            You scored <strong>{score}</strong> out of <strong>{questions.length}</strong>
          </p>
          <p className="mb-6" style={{ color: "#6a5a40" }}>
            {score === questions.length
              ? "Perfect score! Amazing memory!"
              : score >= questions.length / 2
              ? "Great job! Keep exercising your memory."
              : "Keep trying! Practice makes perfect."}
          </p>
          <button
            onClick={handleRestart}
            className="px-8 py-3 bg-[#1a2744] text-white rounded-xl font-semibold hover:bg-[#243660] transition-colors"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f5f0e8" }}>
      <div className="max-w-2xl mx-auto">

        {/* Progress */}
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm font-semibold" style={{ color: "#6a5a40" }}>
            Question {current + 1} of {questions.length}
          </p>
          <p className="text-sm font-semibold" style={{ color: "#AB0520" }}>
            Score: {score}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full mb-8" style={{ backgroundColor: "#d4c9b0" }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${((current + 1) / questions.length) * 100}%`,
              backgroundColor: "#AB0520",
            }}
          />
        </div>

        {/* Question */}
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
              } else if (option === selected) {
                borderColor = "#1a2744";
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

        {/* Feedback + Next */}
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