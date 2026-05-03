const MEMORY_QUESTIONS_KEY = "memory_lane_questions";
const MIN_MEMORY_QUESTIONS = 10;

// const FALLBACK_FACTS = [
//   { title: "Patient's favorite color", answer: "Blue" },
//   { title: "Patient's hometown", answer: "Tucson" },
//   { title: "Patient's elementary school", answer: "Lincoln Elementary" },
//   { title: "Patient's middle school", answer: "Washington Middle" },
//   { title: "Patient's high school", answer: "Central High" },
//   { title: "Patient's college", answer: "University of Arizona" },
//   { title: "Patient's degree title", answer: "Psychology" },
//   { title: "Patients' mother's name", answer: "Maria" },
//   { title: "Patients' father's name", answer: "Jose" },
//   { title: "Favorite ice cream", answer: "Vanilla" },
//   { title: "Best friend", answer: "Sarah" },
//   { title: "First job", answer: "Cashier" },
// ];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(value) {
  return String(value || "").trim();
}

function asPrompt(title) {
  const cleaned = normalize(title).replace(/\?+$/, "");
  if (!cleaned) return "Which memory detail is correct?";
  return cleaned.toLowerCase().startsWith("what")
    ? `${cleaned}?`
    : `What is ${cleaned.toLowerCase()}?`;
}

function buildChoices(correctAnswer, allAnswers) {
  const distractors = shuffle(
    allAnswers.filter((answer) => answer.toLowerCase() !== correctAnswer.toLowerCase())
  ).slice(0, 3);

  const fillers = ["I don't remember", "None of these", "Not sure yet"];
  while (distractors.length < 3) {
    const filler = fillers[distractors.length];
    if (filler.toLowerCase() !== correctAnswer.toLowerCase()) {
      distractors.push(filler);
    }
  }

  return shuffle([correctAnswer, ...distractors]).map((choice, idx) => ({
    id: `choice-${idx + 1}`,
    text: choice,
  }));
}

function toQuestionSet(facts) {
  const answersPool = facts.map((f) => normalize(f.answer)).filter(Boolean);

  return facts.map((fact, idx) => {
    const correctAnswer = normalize(fact.answer);
    return {
      id: `memory-q-${idx + 1}`,
      prompt: asPrompt(fact.title),
      correctAnswer,
      choices: buildChoices(correctAnswer, answersPool),
    };
  });
}

export function buildMemoryQuestions(fields = [], minCount = MIN_MEMORY_QUESTIONS) {
  const fieldFacts = fields
    .map((field) => ({
      title: normalize(field.title),
      answer: normalize(field.answer),
    }))
    .filter((fact) => fact.title && fact.answer);

  const combined = [...fieldFacts, ...FALLBACK_FACTS];
  const uniqueFacts = [];
  const seen = new Set();

  for (const fact of combined) {
    const key = `${fact.title.toLowerCase()}::${fact.answer.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFacts.push(fact);
    }
  }

  const randomizedFacts = shuffle(uniqueFacts);
  const minimumFacts = randomizedFacts.slice(0, Math.max(minCount, MIN_MEMORY_QUESTIONS));
  return shuffle(toQuestionSet(minimumFacts));
}

export function savePreparedMemoryQuestions(questions) {
  localStorage.setItem(
    MEMORY_QUESTIONS_KEY,
    JSON.stringify({
      preparedAt: new Date().toISOString(),
      questions,
    })
  );
}

export function loadPreparedMemoryQuestions() {
  const raw = localStorage.getItem(MEMORY_QUESTIONS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export { MEMORY_QUESTIONS_KEY, MIN_MEMORY_QUESTIONS };
