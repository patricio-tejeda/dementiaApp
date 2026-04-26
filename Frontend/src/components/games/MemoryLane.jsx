import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";

function getNodePositions(count, containerWidth) {
  const cols = 6;
  const padX = 52;
  const usable = containerWidth - padX * 2;
  const gapX = usable / (cols - 1);

  const positions = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const isEvenRow = row % 2 === 0;
    const col = i % cols;
    const colIndex = isEvenRow ? col : cols - 1 - col;
    positions.push({
      x: padX + colIndex * gapX,
      y: 90 + row * 120 + (i % 2 === 0 ? 0 : 16),
    });
  }
  return positions;
}

function buildPathD(positions) {
  if (positions.length < 2) return "";
  let d = `M ${positions[0].x} ${positions[0].y}`;
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    // Smooth curve between points
    const cpx1 = prev.x + (curr.x - prev.x) * 0.5;
    const cpy1 = prev.y;
    const cpx2 = prev.x + (curr.x - prev.x) * 0.5;
    const cpy2 = curr.y;
    d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
  }
  return d;
}

const MIN_MEMORY_QUESTIONS = 10;

function caregiverPrompt(questionText) {
  const cleaned = String(questionText || "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "Let's take our time together. Which answer feels right?";
  }
  const noQ = cleaned.replace(/\?+$/, "");
  return `Let's remember together: ${noQ}?`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toLaneQuestion(question, index) {
  const options = Array.isArray(question.options) ? question.options : [];
  const correct = String(question.correct_answer || "").trim();
  const baseChoices = options.map((opt, idx) => ({
    id: `${question.id}-opt-${idx + 1}`,
    text: String(opt || ""),
  }));
  const choices = baseChoices.length >= 2
    ? baseChoices
    : [
        { id: `${question.id}-opt-1`, text: correct || "I remember this detail" },
        { id: `${question.id}-opt-2`, text: "I need another hint" },
      ];

  return {
    id: `memory-q-${question.id}`,
    sourceQuestionId: question.id,
    prompt: caregiverPrompt(question.question_text),
    correctAnswer: correct || choices[0].text,
    choices: shuffle(choices),
    displayNumber: index + 1,
  };
}

// ─── Confetti ────────────────────────────────────────────────────────
function Confetti({ active, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = canvas.parentElement.offsetWidth);
    const H = (canvas.height = canvas.parentElement.offsetHeight);

    const colors = ["#AB0520", "#1a2744", "#e8c040", "#3a9e5c", "#e07030", "#6a5ac7"];
    const pieces = Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * -H,
      w: 6 + Math.random() * 6,
      h: 10 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3,
      vx: (Math.random() - 0.5) * 2,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 10,
    }));

    let frame;
    let elapsed = 0;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      elapsed++;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < 120) {
        frame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
        onDone?.();
      }
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active, onDone]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
}

// ─── Question Modal ──────────────────────────────────────────────────
function QuestionModal({ question, onClose, onCorrect, onExhausted }) {
  const [selectedChoice, setSelectedChoice] = useState("");
  const [feedback, setFeedback] = useState(null); // "correct" | "retry" | "wrong-final" | null
  const [attempt, setAttempt] = useState(1);

  const maxAttempts = 2;

  const handleSubmit = () => {
    if (!selectedChoice) return;
    const isCorrect = selectedChoice.toLowerCase() === question.correctAnswer.toLowerCase();

    if (isCorrect) {
      setFeedback("correct");
      setTimeout(() => onCorrect(), 600);
      return;
    }

    if (attempt < maxAttempts) {
      setFeedback("retry");
      setAttempt((prev) => prev + 1);
      setTimeout(() => setFeedback(null), 1200);
      return;
    }

    setFeedback("wrong-final");
    setTimeout(() => onExhausted(), 1400);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(26,39,68,0.45)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "#f5f0e8",
          borderRadius: 12,
          width: "90%",
          maxWidth: 420,
          padding: "32px 28px 24px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          position: "relative",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            border: "none",
            background: "transparent",
            fontSize: "1.4rem",
            color: "#1a2744",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Question number badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            backgroundColor: "#AB0520",
            color: "white",
            fontWeight: 800,
            fontSize: "0.95rem",
            marginBottom: 14,
          }}
        >
          {question.displayNumber}
        </div>

        <h3
          style={{
            fontFamily: "Georgia, serif",
            color: "#1a2744",
            fontSize: "1.15rem",
            fontWeight: 700,
            marginBottom: 18,
            lineHeight: 1.4,
          }}
        >
          {question.prompt}
        </h3>

        <div style={{ display: "grid", gap: 8 }}>
          {question.choices.map((choice) => {
            const isSelected = selectedChoice === choice.text;
            return (
              <button
                key={choice.id}
                onClick={() => setSelectedChoice(choice.text)}
                style={{
                  textAlign: "left",
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: `2px solid ${isSelected ? "#AB0520" : "#c8b99a"}`,
                  backgroundColor: isSelected ? "#fff4f1" : "white",
                  color: "#1a2744",
                  cursor: "pointer",
                  fontSize: "0.95rem",
                }}
              >
                {choice.text}
              </button>
            );
          })}
        </div>

        {feedback === "retry" && (
          <p style={{ color: "#d44", fontSize: "0.85rem", marginTop: 8, marginBottom: 0 }}>
            Not quite. Try one more time.
          </p>
        )}
        {feedback === "correct" && (
          <p style={{ color: "#3a9e5c", fontSize: "0.85rem", marginTop: 8, marginBottom: 0, fontWeight: 600 }}>
            That's right!
          </p>
        )}
        {feedback === "wrong-final" && (
          <p style={{ color: "#d44", fontSize: "0.85rem", marginTop: 8, marginBottom: 0 }}>
            The correct answer is: <strong>{question.correctAnswer}</strong>
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedChoice || feedback === "correct" || feedback === "wrong-final"}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 0",
            borderRadius: 6,
            border: "none",
            backgroundColor:
              feedback === "correct" ? "#3a9e5c" : feedback === "wrong-final" ? "#a17f49" : "#AB0520",
            color: "white",
            fontWeight: 700,
            fontSize: "0.95rem",
            cursor: !selectedChoice || feedback === "correct" || feedback === "wrong-final" ? "default" : "pointer",
            opacity: !selectedChoice ? 0.5 : 1,
            transition: "background-color 0.2s",
          }}
        >
          {feedback === "correct"
            ? "Correct!"
            : feedback === "wrong-final"
              ? "Moving to next question..."
              : "Submit"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function MemoryLane() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState([]);
  const [activeQ, setActiveQ] = useState(null);
  const [scheduledRetryKeys, setScheduledRetryKeys] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadQuestionBank() {
      setLoadingQuestions(true);
      try {
        // Prefer adaptive set (personalized by past wrong answers),
        // then generate/fetch if still sparse.
        let adaptiveRes = await apiFetch(`/api/questions/adaptive/?count=${MIN_MEMORY_QUESTIONS}`);
        let payload = adaptiveRes.ok ? await adaptiveRes.json() : [];

        if (!Array.isArray(payload) || payload.length < MIN_MEMORY_QUESTIONS) {
          await apiFetch(`/api/questions/generate/`, {
            method: "POST",
            body: JSON.stringify({}),
          });
          const allRes = await apiFetch(`/api/questions/`);
          payload = allRes.ok ? await allRes.json() : [];
        }

        const normalized = (Array.isArray(payload) ? payload : [])
          .filter((q) => q.question_text && (q.correct_answer || (Array.isArray(q.options) && q.options.length)))
          .slice(0, MIN_MEMORY_QUESTIONS)
          .map((q, idx) => toLaneQuestion(q, idx));

        if (mounted) setQuestions(normalized);
      } catch {
        if (mounted) setQuestions([]);
      } finally {
        if (mounted) setLoadingQuestions(false);
      }
    }

    loadQuestionBank();
    return () => {
      mounted = false;
    };
  }, []);

  // Track container width for responsive path
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const positions = getNodePositions(questions.length, containerWidth);
  const pathD = buildPathD(positions);

  const handleNodeClick = (index) => {
    if (index !== currentStep || !questions[index]) return;
    setActiveQ({
      ...questions[index],
      displayNumber: index + 1,
    });
  };

  const handleCorrect = useCallback(() => {
    if (!activeQ) return;
    setCompleted((prev) => [...prev, activeQ.id]);
    setCurrentStep((prev) => prev + 1);
    setActiveQ(null);
    setShowConfetti(true);
  }, [activeQ]);

  const handleExhausted = useCallback(() => {
    if (!activeQ) return;

    const sourceKey = activeQ.sourceQuestionId || activeQ.id;
    const hasRetryQueued = scheduledRetryKeys.includes(sourceKey);
    const isRetryPrompt = Boolean(activeQ.isRetry);

    if (!hasRetryQueued && !isRetryPrompt) {
      if (typeof sourceKey === "number") {
        apiFetch(`/api/questions/${sourceKey}/record_reprompt/`, {
          method: "POST",
          body: JSON.stringify({}),
        }).catch(() => {});
      }
      setQuestions((prev) => [
        ...prev,
        {
          ...activeQ,
          id: `${sourceKey}-retry`,
          sourceQuestionId: sourceKey,
          isRetry: true,
        },
      ]);
      setScheduledRetryKeys((prev) => [...prev, sourceKey]);
    }

    setCompleted((prev) => [...prev, activeQ.id]);
    setCurrentStep((prev) => prev + 1);
    setActiveQ(null);
  }, [activeQ, scheduledRetryKeys]);

  const totalRows = Math.max(1, Math.ceil(Math.max(questions.length, 1) / 6));
  const svgHeight = 110 + totalRows * 120;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", position: "relative" }}>
      {/* Back link */}
      <button
        onClick={() => navigate("/games")}
        style={{
          border: "none",
          background: "transparent",
          color: "#AB0520",
          fontFamily: "Georgia, serif",
          fontSize: "0.9rem",
          cursor: "pointer",
          padding: 0,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← Back to Activities
      </button>

      <h2
        style={{
          fontFamily: "Georgia, serif",
          color: "#1a2744",
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        Memory Lane
      </h2>
      <p style={{ color: "#6a5a40", fontSize: "0.9rem", marginBottom: 20 }}>
        Questions are randomized each session. If you miss one, you get one retry, and it will come back later.
      </p>
      {loadingQuestions && (
        <p style={{ color: "#6a5a40", fontSize: "0.9rem", marginBottom: 12 }}>
          Preparing memory questions from your profile and diary entries...
        </p>
      )}
      {!loadingQuestions && questions.length === 0 && (
        <p style={{ color: "#AB0520", fontSize: "0.9rem", marginBottom: 12 }}>
          We could not prepare questions yet. Add profile/diary details and try "Generate Questions" in Activities.
        </p>
      )}

      {/* Progress bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: "#d4c9b0",
          marginBottom: 24,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${questions.length ? (completed.length / questions.length) * 100 : 0}%`,
            backgroundColor: "#AB0520",
            borderRadius: 3,
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {/* Path area */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: svgHeight,
          backgroundColor: "white",
          borderRadius: 12,
          border: "1px solid #d4c9b0",
          overflow: "hidden",
        }}
      >
        <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />

        <svg
          width={containerWidth}
          height={svgHeight}
          viewBox={`0 0 ${containerWidth} ${svgHeight}`}
          style={{ display: "block" }}
        >
          {/* Winding path line */}
          <path d={pathD} fill="none" stroke="#d4c9b0" strokeWidth="3" strokeLinecap="round" />

          {/* Completed portion of path */}
          {completed.length > 0 && (
            <path
              d={buildPathD(positions.slice(0, completed.length + 1))}
              fill="none"
              stroke="#AB0520"
              strokeWidth="3"
              strokeLinecap="round"
              style={{ transition: "d 0.4s ease" }}
            />
          )}

          {/* Nodes */}
          {positions.map((pos, i) => {
            const isCompleted = questions[i] && completed.includes(questions[i].id);
            const isCurrent = i === currentStep;
            const isLocked = i > currentStep;
            const nodeRadius = 22;

            return (
              <g
                key={i}
                onClick={() => handleNodeClick(i)}
                style={{ cursor: isCurrent ? "pointer" : "default" }}
              >
                {/* Glow ring for current */}
                {isCurrent && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeRadius + 6}
                    fill="none"
                    stroke="#AB0520"
                    strokeWidth="2"
                    opacity="0.35"
                  >
                    <animate attributeName="r" values={`${nodeRadius + 4};${nodeRadius + 10};${nodeRadius + 4}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.12;0.4" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill={isCompleted ? "#AB0520" : isCurrent ? "#1a2744" : "#c8b99a"}
                  stroke={isCompleted ? "#8a0418" : isCurrent ? "#AB0520" : "#b0a58a"}
                  strokeWidth="2.5"
                  style={{ transition: "fill 0.3s" }}
                />

                {/* Number or check */}
                {isCompleted ? (
                  <text
                    x={pos.x}
                    y={pos.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize="16"
                    fontWeight="800"
                  >
                    ✓
                  </text>
                ) : (
                  <text
                    x={pos.x}
                    y={pos.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isLocked ? "#8a7a60" : "white"}
                    fontSize="14"
                    fontWeight="800"
                    fontFamily="Georgia, serif"
                  >
                    {i + 1}
                  </text>
                )}

                {/* Lock icon for locked nodes */}
                {isLocked && (
                  <text
                    x={pos.x}
                    y={pos.y + nodeRadius + 16}
                    textAnchor="middle"
                    fill="#b0a58a"
                    fontSize="11"
                  >
                    🔒
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Completion message */}
      {questions.length > 0 && completed.length === questions.length && (
        <div
          style={{
            marginTop: 24,
            padding: "20px 24px",
            borderRadius: 10,
            backgroundColor: "#1a2744",
            color: "white",
            textAlign: "center",
          }}
        >
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
            You completed Memory Lane!
          </p>
          <p style={{ fontSize: "0.9rem", opacity: 0.75, marginTop: 6, marginBottom: 0 }}>
            Great job walking through your memories.
          </p>
        </div>
      )}

      {/* Question modal */}
      {activeQ && (
        <QuestionModal
          question={activeQ}
          onClose={() => setActiveQ(null)}
          onCorrect={handleCorrect}
          onExhausted={handleExhausted}
        />
      )}
    </div>
  );
}
