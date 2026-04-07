import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

// ─── Mock data (swap with API calls later) ───────────────────────────
// Each question has an id, the question text, and the expected answer.
// For the real app, answers come from the user's profile data entered by family.
const QUESTIONS = [
  { id: 1, question: "What's your birthday?", answer: "january 1" },
  { id: 2, question: "What's your favorite color?", answer: "blue" },
  { id: 3, question: "What's your mom's birthday?", answer: "march 15" },
  { id: 4, question: "What's your dad's birthday?", answer: "june 20" },
  { id: 5, question: "How many siblings do you have?", answer: "2" },
  { id: 6, question: "What are your siblings' names?", answer: "john, jane" },
  { id: 7, question: "What's your sibling's birthday?", answer: "april 10" },
  { id: 8, question: "Where did you go for elementary school?", answer: "lincoln elementary" },
  { id: 9, question: "Where did you go for middle school?", answer: "washington middle" },
  { id: 10, question: "Where did you go for high school?", answer: "central high" },
  { id: 11, question: "What college did you attend?", answer: "university of arizona" },
  { id: 12, question: "What was your Bachelor's in?", answer: "psychology" },
  { id: 13, question: "Who is your best friend?", answer: "sarah" },
  { id: 14, question: "What was your first job?", answer: "cashier" },
  { id: 15, question: "What was your mom's job?", answer: "teacher" },
  { id: 16, question: "What was your dad's job?", answer: "engineer" },
  { id: 17, question: "Where did your parents meet?", answer: "college" },
  { id: 18, question: "Where is your mom from?", answer: "tucson" },
];

// ─── Path layout: two rows, snaking right then left ──────────────────
// Top row: 1–9 left to right, Bottom row: 10–18 right to left (matches slide 7)
function getNodePositions(count, containerWidth) {
  const cols = 9;
  const padX = 52;
  const usable = containerWidth - padX * 2;
  const gapX = usable / (cols - 1);
  const rowY = [100, 260]; // top row y, bottom row y

  const positions = [];
  for (let i = 0; i < count; i++) {
    const row = i < cols ? 0 : 1;
    const colIndex = i < cols ? i : cols - 1 - (i - cols);
    positions.push({
      x: padX + colIndex * gapX,
      y: rowY[row] + (row === 0 ? (i % 2 === 0 ? 0 : 18) : (i % 2 === 0 ? 18 : 0)),
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
function QuestionModal({ question, onClose, onCorrect }) {
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState(null); // "correct" | "wrong" | null
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim().toLowerCase();
    const expected = question.answer.trim().toLowerCase();
    if (trimmed === expected) {
      setFeedback("correct");
      setTimeout(() => onCorrect(), 600);
    } else {
      setFeedback("wrong");
      setTimeout(() => setFeedback(null), 1200);
    }
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
          {question.id}
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
          {question.question}
        </h3>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && handleSubmit()}
          placeholder="Type your answer..."
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 6,
            border: `2px solid ${feedback === "wrong" ? "#d44" : feedback === "correct" ? "#3a9e5c" : "#c8b99a"}`,
            backgroundColor: "white",
            fontSize: "1rem",
            color: "#1a2744",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
        />

        {feedback === "wrong" && (
          <p style={{ color: "#d44", fontSize: "0.85rem", marginTop: 8, marginBottom: 0 }}>
            Not quite — try again!
          </p>
        )}
        {feedback === "correct" && (
          <p style={{ color: "#3a9e5c", fontSize: "0.85rem", marginTop: 8, marginBottom: 0, fontWeight: 600 }}>
            That's right!
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!value.trim() || feedback === "correct"}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 0",
            borderRadius: 6,
            border: "none",
            backgroundColor: feedback === "correct" ? "#3a9e5c" : "#AB0520",
            color: "white",
            fontWeight: 700,
            fontSize: "0.95rem",
            cursor: !value.trim() || feedback === "correct" ? "default" : "pointer",
            opacity: !value.trim() ? 0.5 : 1,
            transition: "background-color 0.2s",
          }}
        >
          {feedback === "correct" ? "Correct!" : "Submit"}
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
  const [completed, setCompleted] = useState([]); // array of completed question ids
  const [activeQ, setActiveQ] = useState(null); // question object or null
  const [showConfetti, setShowConfetti] = useState(false);

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

  const currentStep = completed.length; // index of the next question to unlock
  const positions = getNodePositions(QUESTIONS.length, containerWidth);
  const pathD = buildPathD(positions);

  const handleNodeClick = (index) => {
    if (index !== currentStep) return; // only the current unlocked node is clickable
    setActiveQ(QUESTIONS[index]);
  };

  const handleCorrect = useCallback(() => {
    setCompleted((prev) => [...prev, activeQ.id]);
    setActiveQ(null);
    setShowConfetti(true);
  }, [activeQ]);

  const svgHeight = 360;

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
        Tap the next circle to answer a question about your life. Get it right to move forward!
      </p>

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
            width: `${(completed.length / QUESTIONS.length) * 100}%`,
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
            const isCompleted = completed.includes(QUESTIONS[i].id);
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
      {completed.length === QUESTIONS.length && (
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
        />
      )}
    </div>
  );
}