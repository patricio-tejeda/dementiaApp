import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ─── Mock data (swap with API later) ─────────────────────────────────
// Structure: each node has an id, the correct name, a relationship label,
// generation (0 = grandparents, 1 = parents/spouses, 2 = children),
// and optional hasVoiceNote flag.
// The `couple` field groups partners. `parentCouple` links children to their parents.

const FAMILY_DATA = {
  couples: [
    { id: "gp", members: ["gp1", "gp2"], generation: 0 },
    { id: "p1", members: ["p1a", "p1b"], generation: 1, parentCouple: "gp" },
    { id: "p2", members: ["p2a", "p2b"], generation: 1, parentCouple: "gp" },
    { id: "p3", members: ["p3a", "p3b"], generation: 1, parentCouple: "gp" },
  ],
  members: {
    gp1: { name: "Snape", relationship: "Grandfather", hasVoiceNote: true },
    gp2: { name: "Lilly", relationship: "Grandmother", hasVoiceNote: true },
    p1a: { name: "Harry", relationship: "Father", hasVoiceNote: false },
    p1b: { name: "Hermoine", relationship: "Mother", hasVoiceNote: true },
    p2a: { name: "Ron", relationship: "Uncle", hasVoiceNote: false },
    p2b: { name: "Lavender", relationship: "Aunt", hasVoiceNote: true },
    p3a: { name: "Neville", relationship: "Uncle", hasVoiceNote: false },
    p3b: { name: "Luna", relationship: "Aunt", hasVoiceNote: true },
  },
  children: [
    { id: "c1", name: "James", relationship: "Son", parentCouple: "p1", hasVoiceNote: false },
    { id: "c2", name: "Sirius", relationship: "Son", parentCouple: "p1", hasVoiceNote: true },
    { id: "c3", name: "Lupin", relationship: "Son", parentCouple: "p1", hasVoiceNote: false },
    { id: "c4", name: "Fred", relationship: "Son", parentCouple: "p2", hasVoiceNote: false },
    { id: "c5", name: "George", relationship: "Son", parentCouple: "p2", hasVoiceNote: true },
    { id: "c6", name: "Draco", relationship: "Son", parentCouple: "p3", hasVoiceNote: false },
    { id: "c7", name: "Pansy", relationship: "Daughter", parentCouple: "p3", hasVoiceNote: false },
  ],
};

// Collect all names for the shuffled picker
function getAllNames(data) {
  const names = [];
  for (const m of Object.values(data.members)) names.push(m.name);
  for (const c of data.children) names.push(c.name);
  return names;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Mini confetti (localized burst) ─────────────────────────────────
function MiniConfetti({ x, y, active, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    const colors = ["#AB0520", "#1a2744", "#e8c040", "#3a9e5c", "#e07030", "#6a5ac7"];
    const pieces = Array.from({ length: 35 }, () => ({
      x: x,
      y: y,
      w: 4 + Math.random() * 5,
      h: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 8,
      vy: -2 - Math.random() * 5,
      gravity: 0.15,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 12,
    }));

    let frame;
    let elapsed = 0;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      elapsed++;
      for (const p of pieces) {
        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.rot += p.rotV;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 80);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < 80) {
        frame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
        onDone?.();
      }
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active, x, y, onDone]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={600}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}
    />
  );
}

// ─── Voice Note Placeholder ──────────────────────────────────────────
function VoiceNoteButton() {
  const [tapped, setTapped] = useState(false);

  return (
    <button
      onClick={() => setTapped(true)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        marginTop: 4,
        padding: "3px 10px",
        borderRadius: 14,
        border: "1px solid #c8b99a",
        backgroundColor: tapped ? "#f0ebe0" : "#f5f0e8",
        color: "#1a2744",
        fontSize: "0.7rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background-color 0.2s",
      }}
    >
      <svg viewBox="0 0 20 20" width="12" height="12" fill="#AB0520">
        <polygon points="5,3 17,10 5,17" />
      </svg>
      {tapped ? "No audio yet" : "Voice Note"}
    </button>
  );
}

// ─── Name Picker Modal ───────────────────────────────────────────────
function NamePicker({ relationship, allNames, correctName, guessedNames, onCorrect, onClose }) {
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null); // "correct" | "wrong"
  const available = allNames.filter((n) => !guessedNames.includes(n));
  const [shuffled] = useState(() => shuffle(available));

  const handlePick = (name) => {
    setSelected(name);
    if (name.toLowerCase() === correctName.toLowerCase()) {
      setFeedback("correct");
      setTimeout(() => onCorrect(), 500);
    } else {
      setFeedback("wrong");
      setTimeout(() => {
        setFeedback(null);
        setSelected(null);
      }, 800);
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
          maxWidth: 380,
          padding: "28px 24px 22px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 10, right: 14,
            border: "none", background: "transparent",
            fontSize: "1.4rem", color: "#1a2744", cursor: "pointer",
          }}
        >
          ×
        </button>

        <p style={{ color: "#6a5a40", fontSize: "0.8rem", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          Who is your
        </p>
        <h3 style={{ fontFamily: "Georgia, serif", color: "#1a2744", fontSize: "1.2rem", fontWeight: 700, marginBottom: 16 }}>
          {relationship}?
        </h3>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {shuffled.map((name) => {
            const isThis = selected === name;
            const isCorrectPick = isThis && feedback === "correct";
            const isWrongPick = isThis && feedback === "wrong";

            return (
              <button
                key={name}
                onClick={() => !feedback && handlePick(name)}
                disabled={!!feedback}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `2px solid ${isCorrectPick ? "#3a9e5c" : isWrongPick ? "#d44" : isThis ? "#1a2744" : "#c8b99a"}`,
                  backgroundColor: isCorrectPick ? "#e6f5ec" : isWrongPick ? "#fde8e8" : isThis ? "#eae5db" : "white",
                  color: "#1a2744",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: feedback ? "default" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        {feedback === "wrong" && (
          <p style={{ color: "#d44", fontSize: "0.82rem", marginTop: 10, marginBottom: 0 }}>
            Not quite — try another!
          </p>
        )}
        {feedback === "correct" && (
          <p style={{ color: "#3a9e5c", fontSize: "0.82rem", marginTop: 10, marginBottom: 0, fontWeight: 600 }}>
            That's right!
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tree Layout Calculation ─────────────────────────────────────────
function useTreeLayout(data, containerWidth) {
  const nodeW = 80;
  const nodeH = 40;
  const genGap = 110;
  const coupleGap = 18; // gap between partners
  const startY = 30;

  const positions = {}; // id -> { x, y, cx, cy }
  const lines = []; // { from: {x,y}, to: {x,y} }

  // Gen 0: grandparents (single couple, centered)
  const gpCouple = data.couples.find((c) => c.generation === 0);
  const gpCx = containerWidth / 2;
  const gpY = startY;

  gpCouple.members.forEach((mid, i) => {
    const x = gpCx - nodeW - coupleGap / 2 + i * (nodeW + coupleGap);
    positions[mid] = { x, y: gpY, cx: x + nodeW / 2, cy: gpY + nodeH / 2 };
  });

  // Couple connector (horizontal line between partners)
  const gp1Pos = positions[gpCouple.members[0]];
  const gp2Pos = positions[gpCouple.members[1]];

  // Gen 1: parent couples
  const gen1Couples = data.couples.filter((c) => c.generation === 1);
  const gen1Count = gen1Couples.length;
  const gen1TotalW = gen1Count * (nodeW * 2 + coupleGap) + (gen1Count - 1) * 40;
  const gen1StartX = (containerWidth - gen1TotalW) / 2;
  const gen1Y = gpY + genGap;

  // Center point of grandparents for vertical drop line
  const gpMidX = (gp1Pos.cx + gp2Pos.cx) / 2;
  const gpBottom = gpY + nodeH;

  gen1Couples.forEach((couple, ci) => {
    const coupleStartX = gen1StartX + ci * (nodeW * 2 + coupleGap + 40);
    couple.members.forEach((mid, i) => {
      const x = coupleStartX + i * (nodeW + coupleGap);
      positions[mid] = { x, y: gen1Y, cx: x + nodeW / 2, cy: gen1Y + nodeH / 2 };
    });
  });

  // Lines from grandparents down to gen1 couples
  const gen1MidY = gpBottom + (gen1Y - gpBottom) / 2;
  lines.push({ from: { x: gpMidX, y: gpBottom }, to: { x: gpMidX, y: gen1MidY } });

  gen1Couples.forEach((couple) => {
    const m1 = positions[couple.members[0]];
    const m2 = positions[couple.members[1]];
    const coupleMidX = (m1.cx + m2.cx) / 2;
    lines.push({ from: { x: gpMidX, y: gen1MidY }, to: { x: coupleMidX, y: gen1MidY } });
    lines.push({ from: { x: coupleMidX, y: gen1MidY }, to: { x: coupleMidX, y: gen1Y } });
  });

  // Gen 2: children
  const gen2Y = gen1Y + genGap;

  gen1Couples.forEach((couple) => {
    const kids = data.children.filter((c) => c.parentCouple === couple.id);
    if (kids.length === 0) return;

    const m1 = positions[couple.members[0]];
    const m2 = positions[couple.members[1]];
    const coupleMidX = (m1.cx + m2.cx) / 2;
    const coupleBottom = gen1Y + nodeH;

    const kidsW = kids.length * nodeW + (kids.length - 1) * 14;
    const kidsStartX = coupleMidX - kidsW / 2;
    const kidsMidY = coupleBottom + (gen2Y - coupleBottom) / 2;

    lines.push({ from: { x: coupleMidX, y: coupleBottom }, to: { x: coupleMidX, y: kidsMidY } });

    kids.forEach((kid, ki) => {
      const x = kidsStartX + ki * (nodeW + 14);
      positions[kid.id] = { x, y: gen2Y, cx: x + nodeW / 2, cy: gen2Y + nodeH / 2 };

      lines.push({ from: { x: coupleMidX, y: kidsMidY }, to: { x: x + nodeW / 2, y: kidsMidY } });
      lines.push({ from: { x: x + nodeW / 2, y: kidsMidY }, to: { x: x + nodeW / 2, y: gen2Y } });
    });
  });

  return { positions, lines, nodeW, nodeH, totalHeight: gen2Y + nodeH + 40 };
}

// ─── Single Tree Node ────────────────────────────────────────────────
function TreeNode({ id, label, relationship, isGuessed, hasVoiceNote, pos, nodeW, nodeH, onClick }) {
  return (
    <g>
      <rect
        x={pos.x}
        y={pos.y}
        width={nodeW}
        height={nodeH}
        rx={20}
        ry={20}
        fill={isGuessed ? "#1a2744" : "#c8b99a"}
        stroke={isGuessed ? "#AB0520" : "#b0a58a"}
        strokeWidth={2}
        style={{ cursor: isGuessed ? "default" : "pointer", transition: "fill 0.3s" }}
        onClick={() => !isGuessed && onClick()}
      />
      {isGuessed ? (
        <text
          x={pos.cx}
          y={pos.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize="11"
          fontWeight="700"
          fontFamily="Georgia, serif"
          style={{ pointerEvents: "none" }}
        >
          {label}
        </text>
      ) : (
        <text
          x={pos.cx}
          y={pos.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#5a4e3a"
          fontSize="9.5"
          fontWeight="600"
          style={{ pointerEvents: "none", textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {relationship}
        </text>
      )}
      {/* Question mark for unguessed */}
      {!isGuessed && (
        <text
          x={pos.cx}
          y={pos.y - 6}
          textAnchor="middle"
          fill="#AB0520"
          fontSize="14"
          fontWeight="800"
        >
          ?
        </text>
      )}
    </g>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function FamilyTree() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [guessed, setGuessed] = useState([]); // array of member ids
  const [activeNode, setActiveNode] = useState(null); // { id, relationship, correctName }
  const [confetti, setConfetti] = useState(null); // { x, y }
  const allNames = getAllNames(FAMILY_DATA);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const { positions, lines, nodeW, nodeH, totalHeight } = useTreeLayout(FAMILY_DATA, containerWidth);

  const totalNodes = Object.keys(FAMILY_DATA.members).length + FAMILY_DATA.children.length;

  const handleNodeClick = (id, relationship, correctName) => {
    setActiveNode({ id, relationship, correctName });
  };

  const handleCorrect = useCallback(() => {
    const pos = positions[activeNode.id];
    setGuessed((prev) => [...prev, activeNode.id]);
    setActiveNode(null);
    if (pos) {
      setConfetti({ x: pos.cx, y: pos.cy });
    }
  }, [activeNode, positions]);

  const clearConfetti = useCallback(() => setConfetti(null), []);

  // Build lookup for voice notes on guessed nodes
  const getMemberInfo = (id) => {
    if (FAMILY_DATA.members[id]) return FAMILY_DATA.members[id];
    const child = FAMILY_DATA.children.find((c) => c.id === id);
    return child || null;
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", position: "relative" }}>
      <button
        onClick={() => navigate("/games")}
        style={{
          border: "none", background: "transparent", color: "#AB0520",
          fontFamily: "Georgia, serif", fontSize: "0.9rem", cursor: "pointer",
          padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ← Back to Activities
      </button>

      <h2 style={{ fontFamily: "Georgia, serif", color: "#1a2744", fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>
        Family Tree
      </h2>
      <p style={{ color: "#6a5a40", fontSize: "0.9rem", marginBottom: 20 }}>
        Tap a circle to guess who belongs there. Get it right to reveal their name and unlock their voice note!
      </p>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 3, backgroundColor: "#d4c9b0", marginBottom: 24, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${(guessed.length / totalNodes) * 100}%`,
            backgroundColor: "#AB0520",
            borderRadius: 3,
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {/* Tree area */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          backgroundColor: "white",
          borderRadius: 12,
          border: "1px solid #d4c9b0",
          overflow: "hidden",
        }}
      >
        <MiniConfetti x={confetti?.x || 0} y={confetti?.y || 0} active={!!confetti} onDone={clearConfetti} />

        <svg
          width={containerWidth}
          height={totalHeight}
          viewBox={`0 0 ${containerWidth} ${totalHeight}`}
          style={{ display: "block" }}
        >
          {/* Connection lines */}
          {lines.map((line, i) => (
            <line
              key={i}
              x1={line.from.x} y1={line.from.y}
              x2={line.to.x} y2={line.to.y}
              stroke="#c8b99a"
              strokeWidth="2"
            />
          ))}

          {/* Couple connectors (horizontal between partners) */}
          {FAMILY_DATA.couples.map((couple) => {
            const p1 = positions[couple.members[0]];
            const p2 = positions[couple.members[1]];
            if (!p1 || !p2) return null;
            return (
              <line
                key={couple.id + "-couple"}
                x1={p1.x + nodeW} y1={p1.cy}
                x2={p2.x} y2={p2.cy}
                stroke="#AB0520"
                strokeWidth="2"
              />
            );
          })}

          {/* Member nodes */}
          {Object.entries(FAMILY_DATA.members).map(([id, info]) => {
            const pos = positions[id];
            if (!pos) return null;
            return (
              <TreeNode
                key={id}
                id={id}
                label={info.name}
                relationship={info.relationship}
                isGuessed={guessed.includes(id)}
                hasVoiceNote={info.hasVoiceNote}
                pos={pos}
                nodeW={nodeW}
                nodeH={nodeH}
                onClick={() => handleNodeClick(id, info.relationship, info.name)}
              />
            );
          })}

          {/* Children nodes */}
          {FAMILY_DATA.children.map((child) => {
            const pos = positions[child.id];
            if (!pos) return null;
            return (
              <TreeNode
                key={child.id}
                id={child.id}
                label={child.name}
                relationship={child.relationship}
                isGuessed={guessed.includes(child.id)}
                hasVoiceNote={child.hasVoiceNote}
                pos={pos}
                nodeW={nodeW}
                nodeH={nodeH}
                onClick={() => handleNodeClick(child.id, child.relationship, child.name)}
              />
            );
          })}
        </svg>

        {/* Voice note buttons overlaid on guessed nodes that have them */}
        {guessed.map((id) => {
          const info = getMemberInfo(id);
          const pos = positions[id];
          if (!info || !info.hasVoiceNote || !pos) return null;
          return (
            <div
              key={id + "-voice"}
              style={{
                position: "absolute",
                left: pos.cx,
                top: pos.y + nodeH + 2,
                transform: "translateX(-50%)",
                zIndex: 10,
              }}
            >
              <VoiceNoteButton />
            </div>
          );
        })}
      </div>

      {/* Completion */}
      {guessed.length === totalNodes && (
        <div
          style={{
            marginTop: 24, padding: "20px 24px", borderRadius: 10,
            backgroundColor: "#1a2744", color: "white", textAlign: "center",
          }}
        >
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
            You completed your Family Tree!
          </p>
          <p style={{ fontSize: "0.9rem", opacity: 0.75, marginTop: 6, marginBottom: 0 }}>
            Tap any voice note button to hear messages from your loved ones.
          </p>
        </div>
      )}

      {/* Name picker modal */}
      {activeNode && (
        <NamePicker
          relationship={activeNode.relationship}
          allNames={allNames}
          correctName={activeNode.correctName}
          guessedNames={guessed.map((id) => getMemberInfo(id)?.name).filter(Boolean)}
          onCorrect={handleCorrect}
          onClose={() => setActiveNode(null)}
        />
      )}
    </div>
  );
}