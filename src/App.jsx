import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ─────────────────────────────────────────────────
const STOPWORDS = new Set([
  // articles, conjunctions, prepositions
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from",
  "into","onto","upon","within","without","against","between","among","through",
  "during","before","after","above","below","under","over","again","further",
  // pronouns
  "i","me","my","myself","we","our","ours","ourselves","you","your","yours",
  "yourself","he","him","his","himself","she","her","hers","herself","it","its",
  "itself","they","them","their","theirs","themselves","this","that","these",
  "those","who","whom","which","what","whose",
  // common verbs stripped of meaning in isolation
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","can","shall","must","ought",
  "get","got","gotten","go","goes","went","gone","come","came","make","made",
  "take","took","taken","put","set","let","keep","kept","hold","held","bring",
  "brought","give","gave","given","find","found","know","knew","known","think",
  "thought","see","saw","seen","look","say","said","tell","told","ask","seem",
  "become","became","leave","left","call","try","tried","use","used","turn",
  "show","start","play","run","move","live","stand","hear","let","help","talk",
  "follow","mean","meant","feel","felt",
  // filler and common adverbs/adjectives
  "just","like","so","if","not","no","yes","okay","well","also","then","now",
  "here","there","very","too","more","most","some","any","all","every","each",
  "both","few","more","other","such","same","even","still","back","way","much",
  "many","than","then","its","been","into","out","up","down","off","new","good",
  "long","little","own","right","big","high","old","great","small","large",
  "next","early","young","important","public","private","real","best","free",
  "really","never","always","maybe","actually","probably","already","almost",
  "though","because","since","while","where","when","once","only","first",
  "last","ever","never","often","sometimes","usually","around","about","across",
  "along","away","rather","quite","pretty","however","whatever","whenever",
  "something","anything","everything","nothing","someone","anyone","everyone",
  "thing","things","stuff","people","person","time","year","day","week","month",
  "way","place","part","case","point","fact","sure","kind","sort","type","lot",
  "bit","piece","side","number","line","hand","room","face","body","home","word",
  "work","world","life","form","air","night","today","whole","area","name","end"
]);

// High-signal words: rare in everyday speech but dense with meaning in personal reflection
const SIGNIFICANCE = {
  // emotional states — high signal
  anxious:3,anxiety:3,panic:3,panicking:3,overwhelmed:3,overload:3,
  depressed:3,depression:3,hopeless:3,helpless:3,worthless:3,empty:3,numb:3,
  grief:3,grieving:3,loss:3,trauma:3,traumatic:3,
  lonely:2.5,alone:2.5,isolated:2.5,abandoned:2.5,rejected:2.5,
  angry:2.5,rage:3,furious:3,resentment:2.5,bitterness:2.5,
  scared:2.5,afraid:2.5,terrified:3,dread:2.5,fear:2.5,
  ashamed:3,shame:3,guilt:3,guilty:2.5,embarrassed:2,
  tired:2,exhausted:3,burnout:3,drained:2.5,depleted:2.5,
  stuck:2.5,trapped:3,paralyzed:3,frozen:2.5,blocked:2,
  confused:2,lost:2,uncertain:2,unclear:2,directionless:2.5,
  sad:2,upset:2,hurt:2.5,broken:2.5,crushed:3,shattered:3,
  jealous:2.5,envious:2,bitter:2,
  hopeful:2.5,grateful:2.5,excited:2,proud:2.5,happy:2,joyful:2.5,
  relieved:2.5,peaceful:2.5,calm:2,content:2,fulfilled:2.5,
  love:2,loved:2,loving:2,connection:2.5,belonging:2.5,
  // life domains — medium signal
  relationship:2,relationships:2,partner:2,family:2,friend:2,friends:2,
  work:1.5,career:2,purpose:2.5,money:2,health:2,body:1.5,
  future:1.5,past:1.5,mistake:2,failure:2.5,success:2,
  // cognitive/process words — lower but real signal
  stress:2,pressure:2,responsibility:2,boundary:2.5,boundaries:2.5,
  change:1.5,decision:2,choice:2,control:2,
  healing:2.5,growth:2.5,progress:2,clarity:2.5,
};

// ─── Utilities ─────────────────────────────────────────────────
function extractKeywords(text) {
  if (!text || text.length < 5) return [];

  const raw = text.toLowerCase();
  const words = raw.match(/\b[a-z]{3,}\b/g) || [];
  const total = words.length || 1;

  const freq = {};
  const firstSeen = {};
  const sigScore = {};

  words.forEach((w, i) => {
    if (STOPWORDS.has(w)) return;
    if (freq[w] === undefined) {
      freq[w] = 0;
      firstSeen[w] = i / total;
      sigScore[w] = SIGNIFICANCE[w] || 1;
    }
    freq[w]++;
  });

  // Final score: significance × log(freq+1) × recency bias
  // log dampens repetition so one word can't dominate just by being said 20 times
  const scored = Object.keys(freq).map(w => ({
    word: w,
    score: sigScore[w] * Math.log2(freq[w] + 1) * (1 - firstSeen[w] * 0.25),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Diversity pass: deduplicate morphological variants (stem to 4 chars)
  // and ensure we span different score tiers (don't just return 7 near-equal words)
  const selected = [];
  const stems = new Set();

  for (const { word } of scored) {
    if (selected.length >= 7) break;
    const stem = word.slice(0, 4);
    if (!stems.has(stem)) {
      selected.push(word);
      stems.add(stem);
    }
  }

  return selected;
}


function HighlightedText({ text, keywords }) {
  if (!text) return null;
  if (!keywords.length) return <span>{text}</span>;
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        keywords.includes(part.toLowerCase())
          ? <mark key={i} style={{ background: "#EBF4EB", color: "#4E8C4E", borderRadius: "3px", padding: "1px 3px", fontWeight: 500 }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

// ─── Icons ─────────────────────────────────────────────────────
const PlusIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

// ─── Styles ────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #F8F7F3;
  --bg-dim:   #EFEDE8;
  --bg-panel: #EBEBEA;
  --ink:      #1A1A18;
  --ink-2:    #6B6B68;
  --ink-3:    #AEACAA;
  --green:    #4E8C4E;
  --green-bg: #EBF4EB;
  --accent:   #3D7A5A;
  --border:   #E2DFD9;
}

html, body, #root { height: 100%; background: var(--bg); }

.tp-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  font-family: 'Nunito', sans-serif;
  color: var(--ink);
}

/* ── HEADER ── */
.tp-header {
  height: 68px;
  display: flex;
  align-items: center;
  padding: 0 32px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg);
  position: relative;
  z-index: 5;
}
.tp-logo {
  font-family: 'Nunito', sans-serif;
  font-size: 38px;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: -0.02em;
  line-height: 1;
  user-select: none;
  cursor: default;
  transition: text-shadow 0.3s ease, color 0.3s ease;
}
.tp-logo:hover {
  color: var(--accent);
  text-shadow:
    0 0 8px rgba(61,122,90,0.6),
    0 0 20px rgba(61,122,90,0.35),
    0 0 40px rgba(61,122,90,0.2);
}

/* ── RAIN ── */
.tp-rain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 999;
  overflow: hidden;
}
.tp-raindrop {
  position: absolute;
  top: -18px;
  width: 1.5px;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0;
  animation: raindrop-fall linear forwards;
}
@keyframes raindrop-fall {
  0%   { transform: translateY(0);    opacity: 0; }
  8%   { opacity: 0.45; }
  90%  { opacity: 0.3; }
  100% { transform: translateY(105vh); opacity: 0; }
}

/* ── CUSTOM CURSOR ── */
* { cursor: none !important; }
.tp-cursor {
  position: fixed;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  transition: transform 0.12s ease, opacity 0.2s ease, width 0.2s ease, height 0.2s ease;
  mix-blend-mode: multiply;
}
.tp-cursor.hovering {
  width: 22px;
  height: 22px;
  opacity: 0.6;
}

/* ── GRASS ── */
.tp-grass {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 80px;
  pointer-events: none;
  z-index: 998;
  overflow: hidden;
}
.tp-grass svg {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.tp-blade {
  fill: none;
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tp-blade-grow {
  animation: blade-grow cubic-bezier(0.4,0,0.2,1) both;
}
@keyframes blade-grow {
  from { stroke-dashoffset: var(--blade-len); }
  to   { stroke-dashoffset: 0; }
}
.tp-grass-fade-out {
  animation: grass-fade 0.6s ease forwards;
}
@keyframes grass-fade {
  to { opacity: 0; }
}

/* ── CREDITS ── */
.tp-credits {
  position: absolute;
  right: 32px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ink-3);
  font-weight: 400;
  letter-spacing: 0.02em;
}
.tp-credits-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}
.tp-credits-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.5px solid var(--accent);
  transition: background 0.3s ease;
}
.tp-credits-dot.used {
  background: transparent;
  border-color: var(--border);
}
.tp-credits-dot.active {
  background: var(--accent);
}
.tp-out-of-credits {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
  height: 100%;
}
.tp-out-heading {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.tp-out-sub {
  font-size: 13px;
  color: var(--ink-2);
  font-weight: 300;
  line-height: 1.65;
  max-width: 260px;
}

/* ── MAIN ────────────────────────────────── */
.tp-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}


/* INK ANIMATION — plant grows into a flower, stroke by stroke */
.tp-ink-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px 0;
}
.tp-ink-svg {
  height: 200px;
  width: auto;
  overflow: visible;
  transform-origin: 40px 28px;
  animation: plant-breathe 5s ease-in-out 8.5s infinite;
}
.tp-ink-path {
  fill: none;
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Ground line */
.tp-ink-ground {
  stroke-width: 1.4;
  stroke-dasharray: 60;
  stroke-dashoffset: 60;
  animation: ink-draw 1s cubic-bezier(0.4,0,0.2,1) 0.2s forwards;
}
/* Stem */
.tp-ink-stem {
  stroke-width: 1.3;
  stroke-dasharray: 58;
  stroke-dashoffset: 58;
  animation: ink-draw 1.2s cubic-bezier(0.4,0,0.2,1) 0.9s forwards;
}
/* Left leaf */
.tp-ink-leaf-l {
  stroke-width: 1.2;
  stroke-dasharray: 58;
  stroke-dashoffset: 58;
  animation: ink-draw 1s cubic-bezier(0.4,0,0.2,1) 1.8s forwards;
}
/* Right leaf */
.tp-ink-leaf-r {
  stroke-width: 1.2;
  stroke-dasharray: 58;
  stroke-dashoffset: 58;
  animation: ink-draw 1s cubic-bezier(0.4,0,0.2,1) 2.7s forwards;
}
/* Five petals — each draws in sequence */
.tp-ink-petal-1 {
  stroke-width: 1.15;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: ink-draw 1.5s cubic-bezier(0.4,0,0.2,1) 3.7s both;
}
.tp-ink-petal-2 {
  stroke-width: 1.15;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: ink-draw 1.5s cubic-bezier(0.4,0,0.2,1) 4.3s both;
}
.tp-ink-petal-3 {
  stroke-width: 1.15;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: ink-draw 1.5s cubic-bezier(0.4,0,0.2,1) 4.9s both;
}
.tp-ink-petal-4 {
  stroke-width: 1.15;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: ink-draw 1.5s cubic-bezier(0.4,0,0.2,1) 5.5s both;
}
.tp-ink-petal-5 {
  stroke-width: 1.15;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: ink-draw 1.5s cubic-bezier(0.4,0,0.2,1) 6.1s both;
}
/* Flower centre — small filled dot drawn last */
.tp-ink-centre {
  fill: var(--accent);
  opacity: 0;
  animation: ink-fade-in 0.5s ease 7s forwards;
}
@keyframes ink-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes ink-fade-in {
  to { opacity: 1; }
}
/* Whole flower sways gently after blooming */
@keyframes plant-breathe {
  0%, 100% { transform: rotate(0deg);   opacity: 1; }
  30%       { transform: rotate(1.5deg); opacity: 0.85; }
  70%       { transform: rotate(-1deg);  opacity: 0.9; }
}

/* HOME */
.tp-home {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 7vh 24px 6vh;
  animation: tp-rise 0.7s cubic-bezier(0.22,1,0.36,1) both;
}
.tp-home-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.tp-home-heading {
  font-family: 'Nunito', sans-serif;
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 600;
  letter-spacing: -0.01em;
  text-align: center;
  color: var(--ink);
  line-height: 1.3;
  max-width: 380px;
}
.tp-home-sub {
  font-size: 13.5px;
  color: var(--ink-2);
  font-weight: 400;
  text-align: center;
  margin-top: 4px;
}
.tp-home-hint {
  font-size: 11px;
  color: var(--ink-3);
  text-align: center;
  margin-top: 16px;
  letter-spacing: 0.02em;
}
.tp-record-btn {
  width: 50px; height: 50px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: transparent;
  cursor: pointer;
  margin-top: 20px;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}
.tp-record-btn:hover { transform: scale(1.06); box-shadow: 0 0 0 7px rgba(61,122,90,0.12); }
.tp-record-btn-inner { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); }

/* RECORDING */
.tp-recording {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 28px 36px 20px;
  overflow: hidden;
  animation: tp-rise 0.4s cubic-bezier(0.22,1,0.36,1) both;
}
.tp-rec-title-input {
  font-family: 'Nunito', sans-serif;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
  border: none;
  background: transparent;
  color: var(--ink);
  outline: none;
  width: 100%;
  margin-bottom: 22px;
  caret-color: var(--green);
}
.tp-rec-title-input::placeholder { color: var(--ink-3); font-style: italic; }

.tp-recording-welcome {
  font-size: 13px;
  font-weight: 400;
  color: var(--ink-3);
  letter-spacing: 0.01em;
  line-height: 1.6;
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
  animation: tp-rise 0.6s cubic-bezier(0.22,1,0.36,1) both;
  animation-delay: 0.1s;
  opacity: 0;
  animation-fill-mode: forwards;
}

.tp-transcript-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.tp-transcript {
  flex: 1;
  font-family: 'Nunito', sans-serif;
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink);
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow-y: auto;
  word-break: break-word;
  white-space: pre-wrap;
  padding: 0 4px 0 0;
  caret-color: var(--accent);
  width: 100%;
}
.tp-transcript::placeholder {
  color: var(--ink-3);
  font-style: italic;
}
.tp-transcript-interim {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-3);
  font-style: italic;
  pointer-events: none;
  padding: 0 4px 0 0;
}

.tp-keywords-row {
  display: flex; flex-wrap: wrap; gap: 5px;
  min-height: 34px; padding: 12px 0 8px;
}
.tp-keyword-badge {
  font-family: 'Nunito', sans-serif;
  font-size: 10.5px;
  padding: 3px 9px;
  border-radius: 20px;
  border: 1.5px solid var(--green);
  color: var(--green);
  background: var(--green-bg);
  animation: tp-pop 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
  letter-spacing: 0.02em;
}

.tp-rec-footer {
  display: flex; align-items: center; gap: 10px;
  padding-top: 12px; border-top: 1px solid var(--border);
}
.tp-waveform { display: flex; align-items: center; gap: 2.5px; height: 22px; }
.tp-waveform-bar {
  width: 2.5px; border-radius: 2px;
  background: var(--accent);
  animation: tp-wave 0.7s ease-in-out infinite;
}
.tp-stop-btn {
  width: 20px; height: 20px; border-radius: 4px;
  background: var(--accent); border: none; cursor: pointer; flex-shrink: 0;
  transition: opacity 0.15s, transform 0.1s;
}
.tp-stop-btn:hover { opacity: 0.8; transform: scale(0.93); }
.tp-rec-label { font-size: 11.5px; color: var(--ink-3); letter-spacing: 0.01em; }

/* SUMMARY */
.tp-summary { flex: 1; display: flex; overflow: hidden; animation: tp-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
.tp-summary-left {
  flex: 1.15; padding: 28px 28px 24px 36px;
  overflow-y: auto; border-right: 1px solid var(--border); display: flex; flex-direction: column;
}
.tp-summary-right {
  flex: 0.85; padding: 28px 36px 24px 28px;
  background: var(--bg-dim); overflow-y: auto; display: flex; flex-direction: column;
}
.tp-section-label {
  font-size: 10px; font-weight: 500; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 14px;
}
.tp-summary-session-title {
  font-family: 'Nunito', sans-serif; font-size: 17px; font-weight: 600;
  letter-spacing: -0.01em; color: var(--ink); margin-bottom: 14px;
}
.tp-summary-transcript-body {
  font-family: 'Nunito', sans-serif; font-size: 12.5px;
  line-height: 1.85; color: var(--ink-2); white-space: pre-wrap;
  word-break: break-word; flex: 1;
}
.tp-new-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 500; padding: 6px 13px;
  border-radius: 20px; border: 1.5px solid var(--border);
  background: transparent; cursor: pointer; color: var(--ink-2);
  transition: all 0.15s; margin-top: 20px; align-self: flex-start;
  font-family: 'Nunito', sans-serif;
}
.tp-new-btn:hover { background: var(--bg-panel); color: var(--ink); }
.tp-so-label {
  font-family: 'Nunito', sans-serif; font-size: 21px; font-weight: 600;
  font-style: normal; font-weight: 700; color: var(--ink); margin-bottom: 14px; letter-spacing: -0.01em;
}
.tp-so-body { font-size: 13.5px; line-height: 1.75; color: var(--ink-2); font-weight: 300; }
.tp-loading { display: flex; align-items: center; gap: 5px; margin-top: 10px; }
.tp-loading-dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--green);
  animation: tp-dot 1.2s ease-in-out infinite;
}
.tp-loading-dot:nth-child(2) { animation-delay: 0.18s; }
.tp-loading-dot:nth-child(3) { animation-delay: 0.36s; }
.tp-threads { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border); }

/* TITLE PROMPT OVERLAY */
.tp-title-overlay {
  position: fixed;
  inset: 0;
  background: rgba(248,247,243,0.7);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: tp-fade-in 0.2s ease;
}
.tp-title-modal {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px 36px 28px;
  width: min(400px, 90vw);
  box-shadow: 0 8px 48px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.05);
  animation: tp-modal-rise 0.28s cubic-bezier(0.22,1,0.36,1) both;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tp-title-modal-eyebrow {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: 4px;
}
.tp-title-modal-heading {
  font-family: 'Nunito', sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin-bottom: 16px;
  line-height: 1.3;
}
.tp-title-modal-input {
  font-family: 'Nunito', sans-serif;
  font-size: 17px;
  font-weight: 400;
  font-style: italic;
  border: none;
  border-bottom: 1.5px solid var(--border);
  background: transparent;
  color: var(--ink);
  outline: none;
  width: 100%;
  padding: 6px 0 10px;
  caret-color: var(--green);
  transition: border-color 0.2s;
}
.tp-title-modal-input:focus { border-bottom-color: var(--green); }
.tp-title-modal-input::placeholder { color: var(--ink-3); }
.tp-title-modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
}
.tp-title-modal-skip {
  font-size: 12px;
  color: var(--ink-3);
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'Nunito', sans-serif;
  padding: 0;
  transition: color 0.15s;
}
.tp-title-modal-skip:hover { color: var(--ink-2); }
.tp-title-modal-save {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Nunito', sans-serif;
  color: #fff;
  background: var(--ink);
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.tp-title-modal-save:hover { background: #2e2e2c; }
.tp-title-modal-save:active { transform: scale(0.97); }
.tp-feeling-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 4px 0 2px;
}
.tp-feeling-chip {
  font-family: 'Nunito', sans-serif;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 13px;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.tp-feeling-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.tp-feeling-chip.selected {
  background: var(--green-bg);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.tp-feeling-divider {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin: 10px 0 4px;
}

@keyframes tp-fade-in {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes tp-modal-rise {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ANIMATIONS */
@keyframes tp-rise {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes tp-pop {
  from { opacity: 0; transform: scale(0.75); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes tp-wave {
  0%, 100% { height: 3px; }
  50%       { height: 18px; }
}
@keyframes tp-dot {
  0%, 100% { opacity: 0.2; transform: scale(0.7); }
  50%       { opacity: 1;   transform: scale(1); }
}
`;

// ─── Main Component ────────────────────────────────────────────
export default function ThinkingPartner() {
  const MAX_REFLECTIONS = 5;
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [cursorHover, setCursorHover] = useState(false);
  const [screen, setScreen] = useState("home");
  const [creditsLeft, setCreditsLeft] = useState(() => {
    const used = parseInt(localStorage.getItem("carpel_used") || "0", 10);
    return Math.max(0, MAX_REFLECTIONS - used);
  });
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [keywords, setKeywords] = useState([]);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [micState, setMicState] = useState("idle"); // idle | requesting | granted | denied
  const [titling, setTitling] = useState(false);
  const [pendingTitle, setPendingTitle] = useState("");
  const [selectedFeelings, setSelectedFeelings] = useState([]);
  const [raindrops, setRaindrops] = useState([]);
  const [grassBlades, setGrassBlades] = useState([]);
  const [grassFading, setGrassFading] = useState(false);
  const rainIntervalRef = useRef(null);
  const grassIntervalRef = useRef(null);

  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");
  const titleRef = useRef("");
  const titleInputRef = useRef(null);

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    const move = (e) => setCursorPos({ x: e.clientX, y: e.clientY });
    const over = (e) => {
      const interactive = e.target.closest("button, a, input, textarea, [role=button]");
      setCursorHover(!!interactive);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", over);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", over);
    };
  }, []);
  useEffect(() => { titleRef.current = title; }, [title]);

  useEffect(() => {
    if (transcript.length > 10) setKeywords(extractKeywords(transcript));
  }, [transcript]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" && !["INPUT","BUTTON","TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault();
        if (screen === "home") startRecording();
        else if (screen === "recording") stopRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const startRecording = useCallback(async () => {
    setTranscript("");
    setInterim("");
    setKeywords([]);
    setTitle("");
    setSummary("");
    setWelcomePhrase(WELCOME_PHRASES[Math.floor(Math.random() * WELCOME_PHRASES.length)]);

    // Request mic permission explicitly before doing anything
    setMicState("requesting");
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicState("granted");
    } catch {
      setMicState("denied");
    }

    // Move to recording screen only after permission resolves
    setScreen("recording");

    if (!stream) {
      // Mic denied — stay on recording screen but show nothing, user can still stop
      return;
    }

    // Stop the raw stream — SpeechRecognition handles its own stream
    stream.getTracks().forEach(t => t.stop());

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        let final = ""; let inter = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
          else inter = e.results[i][0].transcript;
        }
        if (final) setTranscript(p => p + final);
        setInterim(inter);
      };
      rec.onerror = () => {};
      try { rec.start(); recognitionRef.current = rec; }
      catch (err) { console.warn('Speech recognition failed to start', err); }
    }
  }, []);

  // Stop audio, then show title prompt
  const stopRecording = useCallback(() => {
    setInterim("");
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    setPendingTitle("");
    setSelectedFeelings([]);
    setTitling(true);
    setTimeout(() => titleInputRef.current?.focus(), 60);
  }, []);

  // Called once user confirms title in modal
  const saveWithTitle = useCallback(async (chosenTitle, feelings = []) => {
    // Check cap before doing anything
    const used = parseInt(localStorage.getItem("carpel_used") || "0", 10);
    if (used >= MAX_REFLECTIONS) {
      setTitling(false);
      setOutOfCredits(true);
      setScreen("summary");
      setSummary("");
      return;
    }

    // Deduct one credit
    const newUsed = used + 1;
    localStorage.setItem("carpel_used", String(newUsed));
    setCreditsLeft(Math.max(0, MAX_REFLECTIONS - newUsed));

    const text = transcriptRef.current.trim();
    const allFeelings = [...feelings, ...(chosenTitle.trim() ? [chosenTitle.trim()] : [])];
    const sessionTitle = allFeelings.length ? allFeelings.join(", ") : "Untitled thought";
    const kws = extractKeywords(text);

    setTitling(false);
    setTitle(sessionTitle);

    setKeywords(kws);
    setScreen("summary");
    setSummaryLoading(true);
    setSummary("");

    try {
      const feelingsContext = allFeelings.length
        ? `The user described their feeling as: ${allFeelings.join(", ")}.`
        : "";

      const systemPrompt = `You are carpel — a calm, perceptive thinking partner. The user has just spoken their raw, unfiltered thoughts aloud. Your job is to help them see those thoughts more clearly.

Here is how you work:

1. LISTEN for the emotional core — scan the transcript for the words, phrases and moments that carry the most weight. These are your anchors.
2. NAME what is actually happening — not what the user says on the surface, but the real feeling or tension underneath. Be specific, not generic.
3. NARROW it down — distill the mess into one or two clear threads. What is this really about?
4. REFLECT it back — write 3 to 4 sentences in a warm, grounded second-person voice. You are not a therapist. You are a trusted friend who actually listened. No filler phrases like "it sounds like" or "I hear you". Just clarity.
5. END with one quiet question or observation — something that gently opens a door without pushing the user through it.

Formatting rules:
- No headers, no lists, no bullet points
- No em dashes
- Plain flowing prose only
- 3 to 4 sentences maximum
- If the transcript is very short or unclear, work with what you have and do not apologise for it`;

      const userMessage = `${feelingsContext ? feelingsContext + "\n\n" : ""}What I said:\n\n${text}`;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          temperature: 0.7,
          max_tokens: 1000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        })
      });
      const data = await res.json();
      const out = data.choices?.[0]?.message?.content || "";
      setSummary(out);
    } catch {
      const fallback = "Your thoughts are here, and they matter. Sometimes the act of saying things out loud is the first step — the clarity often comes after.";
      setSummary(fallback);
    }
    setSummaryLoading(false);
  }, []);

  const goHome = () => {
    setScreen("home");
    setOutOfCredits(false);
    setTranscript(""); setSummary(""); setTitle(""); setKeywords([]);
  };

  const WELCOME_PHRASES = [
    "Take your time. There's no wrong way to do this.",
    "This space is just for you. Say whatever comes to mind.",
    "No one's keeping score. Just let it out.",
    "You don't have to have it figured out. That's what this is for.",
    "Breathe. Start anywhere. It doesn't have to make sense yet.",
    "Whatever's on your mind — big, small, messy — it's welcome here.",
    "You showed up. That's already the hard part.",
  ];

  const startRain = () => {
    setGrassFading(false);
    setGrassBlades([]);

    // Wait for rain to be felt before grass responds
    setTimeout(() => {
    let bladeCount = 0;
    grassIntervalRef.current = setInterval(() => {
      if (bladeCount >= 60) { clearInterval(grassIntervalRef.current); return; }
      setGrassBlades(prev => {
        const x = 2 + Math.random() * 96;           // spread across full width %
        const height = 22 + Math.random() * 38;      // blade height px
        const lean = (Math.random() - 0.5) * 22;     // lean angle
        const thickness = 0.2 + Math.random() * 0.3;
        const len = height * 1.15;
        const delay = 0;
        return [...prev, { id: Math.random(), x, height, lean, thickness, len, delay }];
      });
      bladeCount++;
    }, 280);
    }, 1200);

    rainIntervalRef.current = setInterval(() => {
      setRaindrops(prev => {
        const drop = {
          id: Math.random(),
          left: Math.random() * 100,
          height: 8 + Math.random() * 14,
          duration: 0.7 + Math.random() * 0.8,
        };
        return [...prev.slice(-60), drop];
      });
    }, 30);
  };

  const stopRain = () => {
    clearInterval(rainIntervalRef.current);
    clearInterval(grassIntervalRef.current);
    setGrassFading(true);
    setTimeout(() => { setGrassBlades([]); setGrassFading(false); }, 700);
  };

  const FEELINGS = ["overwhelmed","anxious","stressed","sad","confused","angry","tired","numb","hopeful","grateful","excited","relieved","lonely","frustrated","scared"];
  const toggleFeeling = (f) => setSelectedFeelings(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const waveBars = [12, 20, 8, 18, 22, 14, 10, 16, 20, 8, 14];
  const [welcomePhrase, setWelcomePhrase] = useState(WELCOME_PHRASES[0]);

  return (
    <div className="tp-app">
      <style>{CSS}</style>
      <div
        className={`tp-cursor${cursorHover ? " hovering" : ""}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />
      {grassBlades.length > 0 && (
        <div className={`tp-grass${grassFading ? " tp-grass-fade-out" : ""}`}>
          <svg viewBox="0 0 100 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            {grassBlades.map(b => {
              // Each blade: M(x,80) curves up to tip with a lean
              const tipX = b.x + b.lean;
              const tipY = 80 - b.height;
              const cx = b.x + b.lean * 0.5;
              const cy = 80 - b.height * 0.6;
              const d = `M${b.x},80 Q${cx},${cy} ${tipX},${tipY}`;
              return (
                <path
                  key={b.id}
                  className="tp-blade tp-blade-grow"
                  d={d}
                  strokeWidth={b.thickness}
                  strokeOpacity={0.55 + Math.random() * 0.35}
                  style={{
                    strokeDasharray: b.len,
                    strokeDashoffset: b.len,
                    "--blade-len": b.len,
                    animationDuration: `${1.2 + Math.random() * 1.0}s`,
                  }}
                />
              );
            })}
          </svg>
        </div>
      )}

      {raindrops.length > 0 && (
        <div className="tp-rain">
          {raindrops.map(d => (
            <div
              key={d.id}
              className="tp-raindrop"
              style={{
                left: `${d.left}%`,
                height: `${d.height}px`,
                animationDuration: `${d.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="tp-header">
        <span className="tp-logo" onMouseEnter={startRain} onMouseLeave={stopRain}>carpel</span>
        <div className="tp-credits">
          <div className="tp-credits-dots">
            {Array.from({ length: MAX_REFLECTIONS }).map((_, i) => (
              <div
                key={i}
                className={`tp-credits-dot ${i < (MAX_REFLECTIONS - creditsLeft) ? "used" : "active"}`}
              />
            ))}
          </div>
          <span>{creditsLeft} left</span>
        </div>
      </header>

      {/* ── MAIN ── */}
      <div className="tp-main">

        {screen === "home" && (
          <div className="tp-home">
            <div className="tp-home-text">
              <h1 className="tp-home-heading">You're safe to think out loud here.</h1>
              <p className="tp-home-sub">No judgment. No rush. Just you and your thoughts.</p>
            </div>

            <div className="tp-ink-wrap">
              <svg className="tp-ink-svg" viewBox="4 4 72 74" xmlns="http://www.w3.org/2000/svg">
                {/* Ground */}
                <path className="tp-ink-path tp-ink-ground"
                  style={{strokeDasharray:"60",strokeDashoffset:"60"}}
                  d="M20,72 Q40,75 60,72" />
                {/* Stem — straight, clean */}
                <path className="tp-ink-path tp-ink-stem"
                  style={{strokeDasharray:"58",strokeDashoffset:"58"}}
                  d="M40,72 C40,65 40,55 40,44" />
                {/* Left leaf — clean almond off stem, tips pointing left */}
                <path className="tp-ink-path tp-ink-leaf-l"
                  style={{strokeDasharray:"58",strokeDashoffset:"58"}}
                  d="M40,60 C35,56 27,55 28,61 C29,66 37,64 40,60" />
                {/* Right leaf — clean almond off stem, tips pointing right */}
                <path className="tp-ink-path tp-ink-leaf-r"
                  style={{strokeDasharray:"58",strokeDashoffset:"58"}}
                  d="M40,52 C45,47 53,47 52,53 C51,58 43,57 40,52" />
                {/* 5 petals — all identical path, rotated around flower center (40,24) */}
                <g transform="rotate(0,40,28)">
                  <path className="tp-ink-path tp-ink-petal-1"
                    style={{strokeDasharray:"300",strokeDashoffset:"300"}}
                    d="M40,12 C48,22 47,36 40,44 C33,36 32,22 40,12" />
                </g>
                <g transform="rotate(72,40,28)">
                  <path className="tp-ink-path tp-ink-petal-2"
                    style={{strokeDasharray:"300",strokeDashoffset:"300"}}
                    d="M40,12 C48,22 47,36 40,44 C33,36 32,22 40,12" />
                </g>
                <g transform="rotate(144,40,28)">
                  <path className="tp-ink-path tp-ink-petal-3"
                    style={{strokeDasharray:"300",strokeDashoffset:"300"}}
                    d="M40,12 C48,22 47,36 40,44 C33,36 32,22 40,12" />
                </g>
                <g transform="rotate(216,40,28)">
                  <path className="tp-ink-path tp-ink-petal-4"
                    style={{strokeDasharray:"300",strokeDashoffset:"300"}}
                    d="M40,12 C48,22 47,36 40,44 C33,36 32,22 40,12" />
                </g>
                <g transform="rotate(288,40,28)">
                  <path className="tp-ink-path tp-ink-petal-5"
                    style={{strokeDasharray:"300",strokeDashoffset:"300"}}
                    d="M40,12 C48,22 47,36 40,44 C33,36 32,22 40,12" />
                </g>
                {/* Centre dot */}
                <circle className="tp-ink-centre" cx="40" cy="28" r="7" style={{opacity:0}} />
              </svg>
            </div>

            <p className="tp-home-hint">
              {micState === "requesting" ? "Waiting for microphone permission…" :
               micState === "denied" ? "Microphone blocked — will run in demo mode" :
               "Whenever you're ready — press spacebar or tap the button"}
            </p>
            <button className="tp-record-btn" onClick={startRecording} disabled={micState === "requesting"} aria-label="Start recording"
              style={{ opacity: micState === "requesting" ? 0.5 : 1, cursor: micState === "requesting" ? "wait" : "pointer" }}>
              <div className="tp-record-btn-inner" />
            </button>
          </div>
        )}

        {screen === "recording" && (
          <div className="tp-recording">
            <div className="tp-recording-welcome">
              {welcomePhrase}
            </div>
            <div className="tp-transcript-wrap">
              <textarea
                className="tp-transcript"
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Speak or type — whatever comes to mind…"
                spellCheck={false}
              />
              {interim && (
                <span className="tp-transcript-interim">{interim}</span>
              )}
            </div>
            <div className="tp-keywords-row">
              {keywords.map(kw => <span key={kw} className="tp-keyword-badge">{kw}</span>)}
            </div>
            <div className="tp-rec-footer">
              <div className="tp-waveform">
                {waveBars.map((h, i) => (
                  <div key={i} className="tp-waveform-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.065}s` }} />
                ))}
              </div>
              <button className="tp-stop-btn" onClick={stopRecording} aria-label="Stop and reflect" />
              <span className="tp-rec-label">
                tap the square when you're done
              </span>
            </div>
          </div>
        )}

        {screen === "summary" && (
          <div className="tp-summary">
            <div className="tp-summary-left">
              <div className="tp-section-label">You said</div>
              <div className="tp-summary-session-title">{title || "Untitled thought"}</div>
              <div className="tp-summary-transcript-body">{transcript}</div>
              <button className="tp-new-btn" onClick={goHome}>
                <PlusIcon size={12} /> New thought
              </button>
            </div>
            <div className="tp-summary-right">
              <div className="tp-section-label">Drawn out</div>
              {outOfCredits ? (
                <div className="tp-out-of-credits">
                  <div className="tp-out-heading">You've used all 5 reflections.</div>
                  <p className="tp-out-sub">Thank you for trying carpel. Your feedback would mean a lot — reach out at <strong>rushdah@carpel.app</strong></p>
                </div>
              ) : (
                <>
                  <div className="tp-so-label">So…</div>
                  {summaryLoading ? (
                    <>
                      <p className="tp-so-body" style={{ color: "var(--ink-3)" }}>Sorting through your thoughts</p>
                      <div className="tp-loading">
                        <div className="tp-loading-dot" /><div className="tp-loading-dot" /><div className="tp-loading-dot" />
                      </div>
                    </>
                  ) : (
                    <p className="tp-so-body">{summary}</p>
                  )}
                </>
              )}
              {keywords.length > 0 && (
                <div className="tp-threads">
                  <div className="tp-section-label">Threads spotted</div>
                  <div className="tp-keywords-row">
                    {keywords.map(kw => <span key={kw} className="tp-keyword-badge">{kw}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── TITLE PROMPT MODAL ── */}
      {titling && (
        <div className="tp-title-overlay" onClick={(e) => { if (e.target === e.currentTarget) saveWithTitle(pendingTitle, selectedFeelings); }}>
          <div className="tp-title-modal">
            <div className="tp-title-modal-eyebrow">Before we reflect</div>
            <div className="tp-title-modal-heading">How are you feeling right now?</div>
            <div className="tp-feeling-chips">
              {FEELINGS.map(f => (
                <button
                  key={f}
                  className={`tp-feeling-chip${selectedFeelings.includes(f) ? " selected" : ""}`}
                  onClick={() => toggleFeeling(f)}
                >{f}</button>
              ))}
            </div>
            <div className="tp-feeling-divider">or describe it yourself</div>
            <input
              ref={titleInputRef}
              className="tp-title-modal-input"
              placeholder="e.g. scattered, hollow, wired…"
              value={pendingTitle}
              onChange={e => setPendingTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveWithTitle(pendingTitle, selectedFeelings); }}
              maxLength={60}
            />
            <div className="tp-title-modal-actions">
              <button className="tp-title-modal-skip" onClick={() => saveWithTitle("", [])}>
                Skip
              </button>
              <button className="tp-title-modal-save" onClick={() => saveWithTitle(pendingTitle, selectedFeelings)}>
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
