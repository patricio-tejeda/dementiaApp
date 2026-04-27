import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";

// ─── Field Parsing ──────────────────────────────────────────────────
// Order matters: most-specific patterns first.
function classifyTitle(title) {
  const t = (title || "").toLowerCase().trim();

  if (/\bpatient\b.*name/.test(t) || t === "patient name") return { slot: "patient" };

  // Specific grandparents (must come before generic "grandmother"/"grandfather")
  if (/maternal[\s-]*grand(mother|ma)/.test(t)) return { slot: "maternalGrandmother" };
  if (/maternal[\s-]*grand(father|pa)/.test(t)) return { slot: "maternalGrandfather" };
  if (/paternal[\s-]*grand(mother|ma)/.test(t)) return { slot: "paternalGrandmother" };
  if (/paternal[\s-]*grand(father|pa)/.test(t)) return { slot: "paternalGrandfather" };

  // Generic grandparents — fall back to filling maternal first, then paternal
  if (/\bgrand(mother|ma)\b/.test(t)) return { slot: "grandmother" };
  if (/\bgrand(father|pa)\b/.test(t)) return { slot: "grandfather" };

  // Parents + spouse
  if (/\b(mom|mother|mama)\b/.test(t)) return { slot: "mother" };
  if (/\b(dad|father|papa)\b/.test(t)) return { slot: "father" };
  if (/\b(spouse|husband|wife|partner)\b/.test(t)) return { slot: "spouse" };

  // Siblings
  if (/\b(brother|sister|sibling)\b/.test(t)) return { slot: "sibling" };

  // Children
  if (/\b(son|daughter|child|kid)\b/.test(t)) return { slot: "child" };

  // Aunts / uncles (could be maternal or paternal — we don't split here)
  if (/\baunt\b/.test(t)) return { slot: "aunt" };
  if (/\buncle\b/.test(t)) return { slot: "uncle" };

  return null;
}

function buildFamilyFromFields(personalFields, familyFields) {
  let patientName = "You";
  for (const f of personalFields) {
    const c = classifyTitle(f.title);
    if (c?.slot === "patient" && (f.answer || "").trim()) {
      patientName = f.answer.trim();
      break;
    }
  }

  const family = {
    patient: { name: patientName, relationship: "Patient" },
    mother: null,
    father: null,
    spouse: null,
    maternalGrandmother: null,
    maternalGrandfather: null,
    paternalGrandmother: null,
    paternalGrandfather: null,
    siblings: [],
    children: [],
    aunts: [],
    uncles: [],
  };

  // First pass: process explicitly-tagged "maternal"/"paternal" entries so the
  // generic ones don't accidentally claim those slots.
  const explicit = [];
  const generic = [];

  for (const f of familyFields) {
    const c = classifyTitle(f.title);
    if (!c) continue;
    if ((f.answer || "").trim() === "") continue;
    if (/^\d+$/.test(f.answer.trim()) && /number/i.test(f.title)) continue;

    if (c.slot === "grandmother" || c.slot === "grandfather") {
      generic.push({ field: f, c });
    } else {
      explicit.push({ field: f, c });
    }
  }

  const placeNode = ({ field: f, c }) => {
    const node = {
      id: `field-${f.id}`,
      fieldId: f.id,
      name: f.answer.trim(),
      relationship: f.title.replace(/'s name$/i, "").replace(/\bname\b/i, "").trim() || "Family",
      voicelineUrl: f.voiceline_url || null,
      hasVoiceline: !!f.has_voiceline,
    };

    switch (c.slot) {
      case "mother": family.mother = node; break;
      case "father": family.father = node; break;
      case "spouse": family.spouse = node; break;
      case "maternalGrandmother": family.maternalGrandmother = node; break;
      case "maternalGrandfather": family.maternalGrandfather = node; break;
      case "paternalGrandmother": family.paternalGrandmother = node; break;
      case "paternalGrandfather": family.paternalGrandfather = node; break;
      case "grandmother":
        if (!family.maternalGrandmother) family.maternalGrandmother = node;
        else if (!family.paternalGrandmother) family.paternalGrandmother = node;
        break;
      case "grandfather":
        if (!family.maternalGrandfather) family.maternalGrandfather = node;
        else if (!family.paternalGrandfather) family.paternalGrandfather = node;
        break;
      case "sibling": family.siblings.push(node); break;
      case "child": family.children.push(node); break;
      case "aunt": family.aunts.push(node); break;
      case "uncle": family.uncles.push(node); break;
      default: break;
    }
  };

  explicit.forEach(placeNode);
  generic.forEach(placeNode);

  return family;
}

// ─── Layout ─────────────────────────────────────────────────────────
function buildLayout(family, containerWidth) {
  const nodeW = 90;
  const nodeH = 44;
  const genGap = 110;
  const horizGap = 16;
  const startY = 30;

  const nodes = [];
  const lines = [];

  function placeRow(items, y) {
    if (items.length === 0) return [];
    const totalW = items.length * nodeW + (items.length - 1) * horizGap;
    const startX = (containerWidth - totalW) / 2;
    return items.map((item, i) => {
      const x = startX + i * (nodeW + horizGap);
      return { ...item, x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 };
    });
  }

  const gpRow = [];
  if (family.maternalGrandmother) gpRow.push({ ...family.maternalGrandmother, slot: "maternalGrandmother" });
  if (family.maternalGrandfather) gpRow.push({ ...family.maternalGrandfather, slot: "maternalGrandfather" });
  if (family.paternalGrandmother) gpRow.push({ ...family.paternalGrandmother, slot: "paternalGrandmother" });
  if (family.paternalGrandfather) gpRow.push({ ...family.paternalGrandfather, slot: "paternalGrandfather" });

  const gpPlaced = placeRow(gpRow, startY);
  nodes.push(...gpPlaced);
  const gpY = startY;

  const parentRow = [];
  if (family.mother) parentRow.push({ ...family.mother, slot: "mother" });
  if (family.father) parentRow.push({ ...family.father, slot: "father" });
  family.aunts.forEach((a, i) => parentRow.push({ ...a, slot: `aunt-${i}` }));
  family.uncles.forEach((u, i) => parentRow.push({ ...u, slot: `uncle-${i}` }));

  const parentY = gpRow.length > 0 ? gpY + genGap : startY;
  const parentPlaced = placeRow(parentRow, parentY);
  nodes.push(...parentPlaced);

  if (gpPlaced.length > 0 && parentPlaced.length > 0) {
    const gpMidX = (gpPlaced[0].cx + gpPlaced[gpPlaced.length - 1].cx) / 2;
    const parentMidX = (parentPlaced[0].cx + parentPlaced[parentPlaced.length - 1].cx) / 2;
    const midY = gpY + nodeH + (genGap - nodeH) / 2;
    lines.push({ x1: gpMidX, y1: gpY + nodeH, x2: gpMidX, y2: midY });
    lines.push({ x1: gpMidX, y1: midY, x2: parentMidX, y2: midY });
    lines.push({ x1: parentMidX, y1: midY, x2: parentMidX, y2: parentY });
  }

  const patientRow = [];
  family.siblings.forEach((s, i) => patientRow.push({ ...s, slot: `sibling-${i}` }));
  patientRow.push({ ...family.patient, slot: "patient", isPatient: true });
  if (family.spouse) patientRow.push({ ...family.spouse, slot: "spouse" });

  const patientY = parentRow.length > 0 ? parentY + genGap : (gpRow.length > 0 ? gpY + genGap : startY);
  const patientPlaced = placeRow(patientRow, patientY);
  nodes.push(...patientPlaced);

  if (parentPlaced.length > 0) {
    const parentMidX = (parentPlaced[0].cx + parentPlaced[parentPlaced.length - 1].cx) / 2;
    const patientNode = patientPlaced.find(n => n.isPatient);
    const siblingNodes = patientPlaced.filter(n => n.slot.startsWith("sibling-"));
    const childRow = [patientNode, ...siblingNodes].filter(Boolean);
    if (childRow.length > 0) {
      const minX = Math.min(...childRow.map(n => n.cx));
      const maxX = Math.max(...childRow.map(n => n.cx));
      const midY = parentY + nodeH + (genGap - nodeH) / 2;
      lines.push({ x1: parentMidX, y1: parentY + nodeH, x2: parentMidX, y2: midY });
      lines.push({ x1: minX, y1: midY, x2: maxX, y2: midY });
      childRow.forEach(n => {
        lines.push({ x1: n.cx, y1: midY, x2: n.cx, y2: patientY });
      });
    }
  }

  const patientNode = patientPlaced.find(n => n.isPatient);
  const spouseNode = patientPlaced.find(n => n.slot === "spouse");
  if (patientNode && spouseNode) {
    lines.push({
      x1: patientNode.x + nodeW, y1: patientNode.cy,
      x2: spouseNode.x, y2: spouseNode.cy,
      color: "#AB0520",
    });
  }

  const childY = patientPlaced.length > 0 ? patientY + genGap : startY;
  const childPlaced = placeRow(
    family.children.map((c, i) => ({ ...c, slot: `child-${i}` })),
    childY
  );
  nodes.push(...childPlaced);

  if (childPlaced.length > 0 && patientNode) {
    const parentMidX = spouseNode ? (patientNode.cx + spouseNode.cx) / 2 : patientNode.cx;
    const parentBottomY = spouseNode
      ? Math.max(patientNode.y, spouseNode.y) + nodeH
      : patientNode.y + nodeH;
    const minX = Math.min(...childPlaced.map(n => n.cx));
    const maxX = Math.max(...childPlaced.map(n => n.cx));
    const midY = parentBottomY + (childY - parentBottomY) / 2;
    lines.push({ x1: parentMidX, y1: parentBottomY, x2: parentMidX, y2: midY });
    if (childPlaced.length > 1) {
      lines.push({ x1: minX, y1: midY, x2: maxX, y2: midY });
    }
    childPlaced.forEach(n => {
      lines.push({ x1: n.cx, y1: midY, x2: n.cx, y2: childY });
    });
  }

  const totalHeight = (childPlaced.length > 0 ? childY : patientY) + nodeH + 40;
  return { nodes, lines, nodeW, nodeH, totalHeight };
}

// ─── Confetti ───────────────────────────────────────────────────────
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
    const pieces = Array.from({ length: 30 }, () => ({
      x, y,
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
      if (elapsed < 80) frame = requestAnimationFrame(draw);
      else { ctx.clearRect(0, 0, W, H); onDone?.(); }
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active, x, y, onDone]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={800}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}
    />
  );
}

// ─── Name Picker Modal ──────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function NamePicker({ relationship, allNames, correctName, guessedNames, onCorrect, onClose }) {
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const available = allNames.filter((n) => !guessedNames.includes(n));
  const [shuffled] = useState(() => shuffle(available));

  const handlePick = (name) => {
    setSelected(name);
    if (name.toLowerCase() === correctName.toLowerCase()) {
      setFeedback("correct");
      setTimeout(() => onCorrect(), 500);
    } else {
      setFeedback("wrong");
      setTimeout(() => { setFeedback(null); setSelected(null); }, 800);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(26,39,68,0.45)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "#f5f0e8", borderRadius: 12,
          width: "90%", maxWidth: 380,
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

        {shuffled.length === 0 ? (
          <p style={{ color: "#6a5a40", fontSize: "0.9rem" }}>
            No more names available. Add more on the Family Info page.
          </p>
        ) : (
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
                    padding: "8px 16px", borderRadius: 8,
                    border: `2px solid ${isCorrectPick ? "#3a9e5c" : isWrongPick ? "#d44" : isThis ? "#1a2744" : "#c8b99a"}`,
                    backgroundColor: isCorrectPick ? "#e6f5ec" : isWrongPick ? "#fde8e8" : isThis ? "#eae5db" : "white",
                    color: "#1a2744", fontWeight: 600, fontSize: "0.9rem",
                    cursor: feedback ? "default" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}

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

// ─── Voiceline Modal ────────────────────────────────────────────────
function VoicelineModal({ node, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 110,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(26,39,68,0.55)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "#f5f0e8", borderRadius: 14,
          width: "90%", maxWidth: 380,
          padding: "32px 28px 24px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
          position: "relative",
          textAlign: "center",
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

        <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>🎙️</div>
        <p style={{ color: "#AB0520", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
          A message from
        </p>
        <h3 style={{ fontFamily: "Georgia, serif", color: "#1a2744", fontSize: "1.4rem", fontWeight: 700, marginBottom: 20 }}>
          {node.name}
        </h3>

        <audio
          src={node.voicelineUrl}
          controls
          autoPlay
          style={{ width: "100%" }}
        />

        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            padding: "10px 26px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "#1a2744",
            color: "white",
            fontWeight: 700,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Tree Node ──────────────────────────────────────────────────────
function TreeNode({ node, isGuessed, onClick, nodeW, nodeH }) {
  const isPatient = node.isPatient;
  return (
    <g style={{ cursor: isPatient ? "default" : "pointer" }} onClick={() => !isPatient && onClick()}>
      <rect
        x={node.x}
        y={node.y}
        width={nodeW}
        height={nodeH}
        rx={20}
        ry={20}
        fill={isPatient ? "#AB0520" : isGuessed ? "#1a2744" : "#c8b99a"}
        stroke={isPatient ? "#8a0418" : isGuessed ? "#AB0520" : "#b0a58a"}
        strokeWidth={2}
        style={{ transition: "fill 0.3s" }}
      />
      {isPatient || isGuessed ? (
        <text
          x={node.cx} y={node.cy}
          textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize="11" fontWeight="700"
          fontFamily="Georgia, serif"
          style={{ pointerEvents: "none" }}
        >
          {node.name}
        </text>
      ) : (
        <text
          x={node.cx} y={node.cy}
          textAnchor="middle" dominantBaseline="central"
          fill="#5a4e3a" fontSize="9.5" fontWeight="600"
          style={{ pointerEvents: "none", textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {node.relationship}
        </text>
      )}
      {!isPatient && !isGuessed && (
        <text x={node.cx} y={node.y - 6} textAnchor="middle" fill="#AB0520" fontSize="14" fontWeight="800">
          ?
        </text>
      )}
      {isGuessed && node.hasVoiceline && (
        <text x={node.cx} y={node.y + nodeH + 14} textAnchor="middle" fill="#AB0520" fontSize="14">
          🎙️
        </text>
      )}
    </g>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function FamilyTree() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState(null);
  const [guessed, setGuessed] = useState([]);
  const [activeNode, setActiveNode] = useState(null);
  const [confetti, setConfetti] = useState(null);
  const [voicelineNode, setVoicelineNode] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [personalRes, familyRes] = await Promise.all([
          apiFetch(`/api/fields/?category=personal`),
          apiFetch(`/api/fields/?category=family`),
        ]);
        const personalFields = personalRes.ok ? await personalRes.json() : [];
        const familyFields = familyRes.ok ? await familyRes.json() : [];
        if (mounted) {
          setFamily(buildFamilyFromFields(personalFields, familyFields));
        }
      } catch (err) {
        console.error("Failed to load family data:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

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

  const layout = family ? buildLayout(family, containerWidth) : null;
  const guessableNodes = layout ? layout.nodes.filter(n => !n.isPatient) : [];
  const totalGuessable = guessableNodes.length;

  const allNames = guessableNodes.map(n => n.name);

  const handleNodeClick = (node) => {
    if (guessed.includes(node.id) && node.hasVoiceline && node.voicelineUrl) {
      setVoicelineNode(node);
      return;
    }
    if (guessed.includes(node.id)) return;
    setActiveNode(node);
  };

  const handleCorrect = useCallback(() => {
    if (!activeNode) return;
    setGuessed((prev) => [...prev, activeNode.id]);
    setConfetti({ x: activeNode.cx, y: activeNode.cy });

    const guessedNode = activeNode;
    setActiveNode(null);
    if (guessedNode.hasVoiceline && guessedNode.voicelineUrl) {
      setTimeout(() => setVoicelineNode(guessedNode), 700);
    }
  }, [activeNode]);

  const clearConfetti = useCallback(() => setConfetti(null), []);

  if (loading) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 40, textAlign: "center", color: "#6a5a40" }}>
        Loading your family tree...
      </div>
    );
  }

  if (!layout || totalGuessable === 0) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
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
        <div
          style={{
            marginTop: 30, padding: "32px 28px", borderRadius: 12,
            backgroundColor: "white", border: "1px solid #d4c9b0",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#1a2744", fontSize: "1rem", fontWeight: 600, marginBottom: 8 }}>
            No family details yet.
          </p>
          <p style={{ color: "#6a5a40", fontSize: "0.9rem", marginBottom: 16 }}>
            Add family member names on the Family Info page, and they will appear here.
          </p>
          <button
            onClick={() => navigate("/family-info")}
            style={{
              padding: "10px 22px", borderRadius: 8, border: "none",
              backgroundColor: "#AB0520", color: "white",
              fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
            }}
          >
            Go to Family Info
          </button>
        </div>
      </div>
    );
  }

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
        Tap a circle to guess who belongs there. Members with a 🎙️ have a voice message — tap them again to listen.
      </p>

      <div style={{ height: 6, borderRadius: 3, backgroundColor: "#d4c9b0", marginBottom: 24, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${(guessed.length / totalGuessable) * 100}%`,
            backgroundColor: "#AB0520",
            borderRadius: 3,
            transition: "width 0.5s ease",
          }}
        />
      </div>

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
          height={layout.totalHeight}
          viewBox={`0 0 ${containerWidth} ${layout.totalHeight}`}
          style={{ display: "block" }}
        >
          {layout.lines.map((line, i) => (
            <line
              key={i}
              x1={line.x1} y1={line.y1}
              x2={line.x2} y2={line.y2}
              stroke={line.color || "#c8b99a"}
              strokeWidth="2"
            />
          ))}

          {layout.nodes.map((node) => (
            <TreeNode
              key={node.id || node.slot}
              node={node}
              isGuessed={guessed.includes(node.id)}
              onClick={() => handleNodeClick(node)}
              nodeW={layout.nodeW}
              nodeH={layout.nodeH}
            />
          ))}
        </svg>
      </div>

      {guessed.length === totalGuessable && (
        <div
          style={{
            marginTop: 24, padding: "20px 24px", borderRadius: 10,
            backgroundColor: "#1a2744", color: "white", textAlign: "center",
          }}
        >
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
            You completed your Family Tree!
          </p>
        </div>
      )}

      {activeNode && (
        <NamePicker
          relationship={activeNode.relationship}
          allNames={allNames}
          correctName={activeNode.name}
          guessedNames={guessed.map(id => layout.nodes.find(n => n.id === id)?.name).filter(Boolean)}
          onCorrect={handleCorrect}
          onClose={() => setActiveNode(null)}
        />
      )}

      {voicelineNode && (
        <VoicelineModal node={voicelineNode} onClose={() => setVoicelineNode(null)} />
      )}
    </div>
  );
}