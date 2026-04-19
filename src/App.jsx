import { SETS } from "./data.js";
import { useState, useEffect, useRef, useMemo } from "react";

// --- 유틸리티 함수들 ---

const shuffle = a => [...a].sort(() => Math.random() - .5);
const pick = (a, n) => shuffle(a).slice(0, n);
const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * 텍스트를 미국 영어 음성으로 변환하여 재생합니다.
 * @param {string} text - 읽을 텍스트
 * @param {string} lang - 언어 코드 (기본값: en-US)
 */
const speak = (text, lang = "en-US") => {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 1.0;
        window.speechSynthesis.cancel(); // 진행 중인 다른 음성이 있다면 중지
        window.speechSynthesis.speak(utterance);
    } else {
        // 브라우저가 SpeechSynthesis API를 지원하지 않는 경우
        console.warn("Browser does not support text-to-speech.");
    }
};

/**
 * 화면 방향(가로/세로)을 감지하는 커스텀 훅
 */
function useOrientation() {
  const [L, setL] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const c = () => setL(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  return L;
}

/**
 * 브라우저의 localStorage를 사용한 데이터베이스 객체
 * 학습 기록, 북마크 등 모든 데이터를 영구 저장합니다.
 */
const DB = {
  async get(k) { try { const v = localStorage.getItem("voca_" + k); if (v !== null) return JSON.parse(v); } catch {} return null; },
  async set(k, v) { try { localStorage.setItem("voca_" + k, JSON.stringify(v)); } catch {} }
};

// ... (기존 헬퍼 함수들은 변경 없이 그대로 유지)
const getApiKey = () => { try { return localStorage.getItem("voca_apikey") || ""; } catch { return ""; } };
const setApiKey = k => { try { localStorage.setItem("voca_apikey", k); } catch {} };
function tryJSON(t) { try { return JSON.parse(t.replace(/```json|```/g, "").trim()); } catch { const m = t.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch {} return null; } }
const mkOpts = (ans, pool) => shuffle([ans, ...pick(pool.filter(w => w.english !== ans && w.english), 3).map(w => w.english)]);

function buildQuestions(words, allWords, type, diff) {
    const w = shuffle(words);
    const q1 = x => ({ id: uid(), t: 1, wid: x.id, diff, label: "📖 Definition", q: x.definition, ans: x.english, opts: diff === "easy" ? mkOpts(x.english, allWords) : null });
    const q2 = x => { const base = x.exampleSentences?.[0] || x.exampleSentence || ""; const sent = base.includes("___") ? base : base.replace(new RegExp(x.english, "gi"), "___"); return { id: uid(), t: 2, wid: x.id, diff, label: "✏️ Fill in Blank", q: sent, ans: x.english, opts: diff === "easy" ? mkOpts(x.english, allWords) : null }; };
    const q3 = x => { const ua = x.antonyms?.length > 0 && (!x.synonyms?.length || Math.random() > .5); const cue = ua ? x.antonyms[0] : x.synonyms[0]; const rel = ua ? "Antonym" : "Synonym"; return { id: uid(), t: 3, wid: x.id, diff, label: "🔄 " + rel, q: `What is the ${rel.toLowerCase()} of "${cue}"?`, ans: x.english, opts: diff === "easy" ? mkOpts(x.english, allWords) : null }; };
    const q5 = x => ({ id: uid(), t: 5, wid: x.id, label: "🇰🇷 Korean→English", q: x.korean, ans: x.english, opts: null });
    const mk4 = arr => { const gs = []; for (let i = 0; i < arr.length; i += 10) { const c = arr.slice(i, Math.min(i + 10, arr.length)); if (c.length >= 2) gs.push({ id: uid(), t: 4, words: c }); } return gs; };
    if (type === "1") return w.filter(x => x.definition).map(q1);
    if (type === "2") return w.filter(x => x.exampleSentences?.length || x.exampleSentence).map(q2);
    if (type === "3") return w.filter(x => x.synonyms?.length || x.antonyms?.length).map(q3);
    if (type === "4") return mk4(w);
    if (type === "5") return w.filter(x => x.korean).map(q5);
    if (type === "mixed") { const qs = []; w.forEach(x => { const av = [x.definition && 1, (x.exampleSentences?.length || x.exampleSentence) && 2, (x.synonyms?.length || x.antonyms?.length) && 3, x.korean && 5].filter(Boolean); if (!av.length) return; const t = av[Math.floor(Math.random() * av.length)]; if (t === 1) qs.push(q1(x)); else if (t === 2) qs.push(q2(x)); else if (t === 3) qs.push(q3(x)); else qs.push(q5(x)); }); mk4(w).forEach(b => qs.push(b)); return shuffle(qs); }
    return [];
}


// --- UI 컴포넌트들 ---

function Btn({ children, onClick, variant = "primary", size = "md", disabled, className = "" }) {
    const sz = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-base" };
    const vr = { primary: "bg-indigo-600 text-white hover:bg-indigo-700", secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50", ghost: "text-gray-600 hover:bg-gray-100", success: "bg-emerald-500 text-white hover:bg-emerald-600", danger: "bg-red-600 text-white hover:bg-red-700" };
    return <button className={`rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${sz[size]} ${vr[variant]} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

const Card = ({ children, className = "" }) => <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>{children}</div>;
const ProgressBar = ({ value, max }) => <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>;

function ApiKeyModal({ onClose }) {
    const [k, setK] = useState(getApiKey());
    return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">🔑 API Key</h3>
            <p className="text-xs text-gray-500 mb-4">Optional — required for AI features</p>
            <input value={k} onChange={e => setK(e.target.value)} placeholder="sk-ant-..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <div className="flex gap-2">
                <Btn onClick={() => { setApiKey(k.trim()); onClose(); }} className="flex-1">Save</Btn>
                <Btn onClick={onClose} variant="secondary" className="flex-1">Cancel</Btn>
            </div>
        </div>
    </div>;
}

function WordSelectScreen({ setId, wordSel, onSave, nav }) {
    const set = SETS.find(s => s.id === setId); if (!set) return null;
    const [sel, setSel] = useState(() => new Set(wordSel[setId] || set.words.map(w => w.id)));
    const toggleAll = () => sel.size === set.words.length ? setSel(new Set()) : setSel(new Set(set.words.map(w => w.id)));
    const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    return <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
            <button onClick={() => nav("home")} className="text-2xl text-gray-400">←</button>
            <div><h2 className="text-xl font-bold text-gray-900">{set.name} — Select Words</h2><p className="text-xs text-gray-400">Only checked words will be used in Study &amp; Quiz</p></div>
        </div>
        <div className="flex items-center justify-between mb-3">
            <button onClick={toggleAll} className="text-xs text-indigo-600 font-semibold">{sel.size === set.words.length ? "Deselect All" : "Select All"}</button>
            <span className="text-xs text-gray-500 font-semibold">{sel.size}/{set.words.length} selected</span>
        </div>
        <div className="space-y-1 mb-6 overflow-y-auto" style={{ maxHeight: "55vh" }}>
            {set.words.map(w => (
                <button key={w.id} onClick={() => toggle(w.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${sel.has(w.id) ? "border-indigo-400 bg-indigo-50" : "border-gray-100 bg-white hover:border-gray-300"}`}>
                    <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs ${sel.has(w.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-gray-300"}`}>{sel.has(w.id) && "✓"}</span>
                    <span className="font-medium text-sm text-gray-800">{w.english}</span>
                    <span className="text-xs text-gray-400 ml-auto">{w.korean}</span>
                </button>
            ))}
        </div>
        <Btn onClick={() => onSave(setId, [...sel])} size="lg" className="w-full" disabled={sel.size < 2}>Save ({sel.size} words)</Btn>
    </div>;
}

// ... MatchingQuiz, HomeScreen 등 다른 컴포넌트들은 이전과 동일하게 유지 ...
// (아래에 전체 코드가 포함되어 있으니, 이 부분은 생략하고 넘어가셔도 됩니다)

// --- ✨ StudyScreen: 발음 듣기/반복 기능 추가 ---
// --- ✨ StudyScreen: '지속적인' 반복 재생 기능으로 업그레이드 ---

function StudyScreen({ words, setName, nav, mode, navTarget }) {
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);

    // --- 1. 새로운 상태와 ref 추가 ---
    const [isRepeating, setIsRepeating] = useState(false); // 반복 재생 상태
    const repeatIntervalRef = useRef(null); // setInterval의 ID를 저장하기 위한 ref

    const w = words[idx];

    // --- 2. 반복 재생 로직을 처리하는 useEffect ---
    useEffect(() => {
        // isRepeating 상태가 true일 때 반복을 시작
        if (isRepeating) {
            // 즉시 한 번 재생 (첫 1초를 기다리지 않도록)
            speak(w.english);

            // 2초 간격으로 반복 (발음 시간 1초 + 간격 1초)
            repeatIntervalRef.current = setInterval(() => {
                speak(w.english);
            }, 2000);
        } else {
            // isRepeating 상태가 false가 되면 반복을 중지
            clearInterval(repeatIntervalRef.current);
        }

        // 이 useEffect의 cleanup 함수: 컴포넌트가 사라지거나, 의존성이 변경되기 직전에 실행됨
        return () => {
            clearInterval(repeatIntervalRef.current);
        };
    }, [isRepeating, w.english]); // isRepeating 또는 단어가 바뀔 때마다 이 로직을 재실행

    // 단어가 바뀔 때의 처리
    useEffect(() => {
        setFlipped(false);      // 카드 뒤집기 초기화
        setIsRepeating(false);  // 다른 단어로 넘어가면 반복재생은 끔
        speak(w.english);       // 새 단어를 한 번 들려줌
    }, [idx, words]); // idx(단어 인덱스)가 바뀔 때 실행

    if (!w) return null;

    // --- 3. 반복 재생 버튼의 클릭 이벤트 수정 ---
    const handleRepeatClick = (e) => {
        e.stopPropagation(); // 이벤트 버블링 방지
        setIsRepeating(prev => !prev); // isRepeating 상태를 토글
    };


    const exs = w.exampleSentences?.length ? w.exampleSentences : w.exampleSentence ? [w.exampleSentence] : [];
    const hl = s => s?.replace(/___/g, `[${w.english}]`) || s;

    const AudioControls = ({ word }) => (
        <div className="absolute top-3 right-3 flex gap-2">
            <button
                onClick={(e) => { e.stopPropagation(); setIsRepeating(false); speak(word); }}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-lg flex items-center justify-center transition-all active:scale-90"
                title="Listen to pronunciation"
            >
                🔊
            </button>
            <button
                onClick={handleRepeatClick}
                className={`w-8 h-8 rounded-full text-lg flex items-center justify-center transition-all active:scale-90 ${
                    isRepeating ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-100 hover:bg-gray-200'
                }`}
                title="Repeat pronunciation"
            >
                🔁
            </button>
        </div>
    );

    const PH = ({ title }) => <div className="flex items-center gap-3 mb-2">
        <button onClick={() => nav(navTarget)} className="text-2xl text-gray-400">←</button>
        <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-gray-900 truncate">{title} — {setName}</h2>
                <span className="text-sm font-semibold text-indigo-600 ml-2">{idx + 1}/{words.length}</span>
            </div>
            <ProgressBar value={idx + 1} max={words.length} />
        </div>
    </div>;

    const NV = ({ cls = "" }) => <div className={`flex gap-2 ${cls}`}>
        <Btn onClick={() => setIdx(i => i - 1)} disabled={idx === 0} variant="secondary" className="flex-1">← Prev</Btn>
        {idx < words.length - 1
            ? <Btn onClick={() => setIdx(i => i + 1)} className="flex-1">Next →</Btn>
            : <Btn onClick={() => nav(navTarget)} variant="success" className="flex-1">Done ✓</Btn>}
    </div>;

    const SA = () => (w.synonyms?.length > 0 || w.antonyms?.length > 0) ? <div className="flex flex-wrap gap-4 mt-3">
        {w.synonyms?.length > 0 && <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Synonyms</p><div className="flex flex-wrap gap-1">{w.synonyms.map(s => <span key={s} key={s} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">{s}</span>)}</div></div>}
        {w.antonyms?.length > 0 && <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Antonyms</p><div className="flex flex-wrap gap-1">{w.antonyms.map(a => <span key={a} className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full border border-red-100">{a}</span>)}</div></div>}
    </div> : null;

    if (mode === 2) return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <PH title="Study 2" />
            <div onClick={() => setFlipped(f => !f)} className="mt-4 cursor-pointer select-none relative">
                <Card className={`p-8 text-center ${flipped ? "bg-indigo-50" : "bg-white"}`} style={{ minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    {!flipped
                        ? <>
                            <p className="text-xs font-bold text-gray-300 mb-4 uppercase tracking-widest">English</p>
                            <p className="text-4xl font-bold text-gray-900 break-words px-10">{w.english}</p>
                            <p className="text-xs text-gray-300 mt-6">👆 Tap to reveal Korean</p>
                          </>
                        : <>
                            <p className="text-xs font-bold text-indigo-300 mb-4 uppercase tracking-widest">Korean</p>
                            <p className="text-3xl font-bold text-indigo-700">{w.korean || "—"}</p>
                          </>
                    }
                </Card>
                {!flipped && <AudioControls word={w.english} />}
            </div>
            <NV cls="mt-4" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <PH title="Study 1" />
            <Card className="p-5 mt-3 relative">
                <div className="text-2xl font-bold text-gray-900 pr-20">{w.english}</div>
                <AudioControls word={w.english} />

                {w.definition && <div className="mt-3 mb-4">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Definition</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed">{w.definition}</p>
                </div>}
                {exs.length > 0 && <div className="mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Examples</p>
                    <div className="space-y-2">
                        {exs.map((e, i) => <div key={i} className="text-sm text-gray-700 bg-indigo-50 rounded-xl p-3 leading-relaxed">
                            <span className="text-xs text-indigo-400 font-bold mr-1">{i + 1}.</span>{hl(e)}
                        </div>)}
                    </div>
                </div>}
                <SA />
            </Card>
            <NV cls="mt-4" />
        </div>
    );
}


// --- ✨ ResultsScreen: 틀린 단어 자동 북마크 제안 기능 추가 ---
function ResultsScreen({ wrongIds, words, setName, score, correct, total, config, nav, bookmarks, toggleBookmark, bookmarkWords }) {
    const pct = score;
    const col = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-yellow-500" : "text-red-500";
    const bg = pct >= 80 ? "bg-emerald-50" : pct >= 60 ? "bg-yellow-50" : "bg-red-50";
    const wrongWords = words.filter(w => wrongIds.includes(w.id));

    // 컴포넌트가 렌더링될 때 틀린 단어 북마크 여부를 물어보는 기능
    useEffect(() => {
        // 틀린 단어가 있고, 그 중 하나라도 아직 북마크되지 않았다면
        if (wrongWords.length > 0 && wrongWords.some(w => !bookmarks.has(w.id))) {
            if (window.confirm(`틀린 단어 ${wrongWords.length}개를 북마크에 추가할까요?`)) {
                const idsToBookmark = wrongWords.map(w => w.id);
                bookmarkWords(idsToBookmark);
            }
        }
    }, [wrongWords, bookmarkWords, bookmarks]);

    return <div className="max-w-2xl mx-auto px-4 py-6">
        <Card className={`p-8 mb-4 text-center ${bg}`}>
            <div className={`text-7xl font-bold ${col} mb-2`}>{pct}<span className="text-4xl">%</span></div>
            <p className="text-gray-500">{correct}/{total} correct</p>
            <p className="text-xs text-gray-400 mt-1">{setName}</p>
        </Card>

        {wrongWords.length > 0 && <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700">❌ Wrong Words ({wrongWords.length})</h3>
                {/* 'Bookmark All' 버튼은 자동 제안 기능으로 대체되었으므로 삭제 */}
            </div>
            <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                {wrongWords.map(w => <div key={w.id} className="flex items-center justify-between py-2">
                    <div><span className="font-semibold text-gray-800">{w.english}</span><span className="text-sm text-gray-500 ml-2">{w.korean}</span></div>
                    <button onClick={() => toggleBookmark(w.id)} className={`text-xl ml-3 transition-all ${bookmarks.has(w.id) ? "text-yellow-400" : "text-gray-200 hover:text-yellow-300"}`}>🔖</button>
                </div>)}
            </div>
        </Card>}

        <div className="space-y-2">
            {wrongWords.length > 0 && <>
                <Btn onClick={() => nav("study", { words: wrongWords, setName: "Wrong Words", mode: 1, navTarget: "home" })} size="lg" className="w-full">📖 Study Wrong Words</Btn>
                {wrongWords.length >= 2 && <Btn onClick={() => nav("quiz_setup", { words: wrongWords, setName: "Wrong Words", allWords: words })} size="lg" className="w-full">▶ Quiz Wrong Words</Btn>}
            </>}
            <Btn onClick={() => nav("quiz_setup", { words, setName, allWords: words })} variant="secondary" className="w-full">🔁 Try Again</Btn>
            <Btn onClick={() => nav("home")} variant="ghost" className="w-full">Home</Btn>
        </div>
    </div>;
}


// --- 나머지 컴포넌트 및 메인 App 컴포넌트 (변경 없음) ---
// (전체 코드의 일관성을 위해 모두 포함합니다)

function MatchingQuiz({ q, onDone }) {
    const { words } = q;
    const [koreans, setKoreans] = useState(() => shuffle(words.map(w => ({ id: w.id, text: w.korean || w.english }))));
    const [selWord, setSelWord] = useState(null); const [pairs, setPairs] = useState({}); const [submitted, setSubmitted] = useState(false);
    const pairOrder = useRef({});
    const COLORS = ["rose", "orange", "amber", "lime", "teal", "cyan", "blue", "violet", "fuchsia", "pink"].map(c => ({ bg: `bg-${c}-100`, border: `border-${c}-400`, text: `text-${c}-700`, dot: `bg-${c}-400` }));
    useEffect(() => { setKoreans(shuffle(q.words.map(w => ({ id: w.id, text: w.korean || w.english })))); setSelWord(null); setPairs({}); setSubmitted(false); pairOrder.current = {}; }, [q.id]);
    const handleWord = wid => { if (submitted) return; if (selWord === wid) { setSelWord(null); return; } if (pairs[wid]) { delete pairOrder.current[wid]; setPairs(p => { const n = { ...p }; delete n[wid]; return n; }); } setSelWord(wid); };
    const handleKor = kid => { if (submitted || !selWord) return; const used = Object.values(pairOrder.current); let i = 0; while (used.includes(i)) i++; pairOrder.current[selWord] = i; setPairs(p => ({ ...p, [selWord]: kid })); setSelWord(null); };
    const getC = wid => { const i = pairOrder.current[wid]; return i !== undefined ? COLORS[i % COLORS.length] : null; };
    const score = submitted ? words.filter(w => pairs[w.id] === w.id).length : 0;
    return <div>
        <div className="text-center mb-3">{selWord ? <p className="text-sm text-indigo-600 font-medium">"{words.find(w => w.id === selWord)?.english}" → click Korean meaning</p> : <p className="text-sm text-gray-400">Select an English word first</p>}</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="space-y-1.5"><div className="text-xs font-bold text-center text-gray-400 mb-1">English</div>{words.map(w => { const paired = pairs[w.id] !== undefined; const isSel = selWord === w.id; const c = getC(w.id); const pn = c ? Object.keys(pairOrder.current).indexOf(w.id) + 1 : null; const isOk = submitted && pairs[w.id] === w.id; const isBad = submitted && paired && !isOk; return <button key={w.id} onClick={() => handleWord(w.id)} className={`w-full px-2 py-2 rounded-xl border-2 text-xs font-medium transition-all text-left flex items-center gap-1.5 ${isOk ? "border-emerald-400 bg-emerald-50 text-emerald-800" : isBad ? "border-red-400 bg-red-50 text-red-700" : isSel ? "border-indigo-500 bg-indigo-100 text-indigo-800" : c ? `${c.border} ${c.bg} ${c.text}` : "border-gray-200 bg-white hover:border-indigo-300"}`}>{!submitted && c && <span className={`w-4 h-4 rounded-full ${c.dot} text-white text-xs flex items-center justify-center shrink-0 font-bold`}>{pn}</span>}{submitted && (isOk ? <span className="text-emerald-500 text-xs">✓</span> : isBad ? <span className="text-red-500 text-xs">✗</span> : null)}{isSel && <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center shrink-0">→</span>}<span className="truncate">{w.english}</span></button>; })}</div>
            <div className="space-y-1.5"><div className="text-xs font-bold text-center text-gray-400 mb-1">Korean</div>{koreans.map(k => { const mwid = Object.keys(pairs).find(wid => pairs[wid] === k.id); const c = mwid ? getC(mwid) : null; const isOk = submitted && mwid === k.id; const isBad = submitted && mwid && !isOk; return <button key={k.id} onClick={() => handleKor(k.id)} className={`w-full px-2 py-2 rounded-xl border-2 text-xs transition-all text-left flex items-center gap-1.5 ${isOk ? "border-emerald-400 bg-emerald-50 text-emerald-800" : isBad ? "border-red-400 bg-red-50 text-red-700" : c ? `${c.border} ${c.bg} ${c.text}` : selWord ? "border-gray-200 bg-white hover:border-indigo-400" : "border-gray-200 bg-white text-gray-600"}`}>{submitted && (isOk ? <span className="text-emerald-500 text-xs">✓</span> : isBad ? <span className="text-red-500 text-xs">✗</span> : null)}<span className="truncate">{k.text}</span></button>; })}</div>
        </div>
        {!submitted ? <Btn onClick={() => setSubmitted(true)} disabled={Object.keys(pairs).length < words.length} className="w-full">Submit ({Object.keys(pairs).length}/{words.length})</Btn> : <div><div className={`text-center py-3 rounded-xl mb-3 ${score === words.length ? "bg-emerald-50" : "bg-indigo-50"}`}><p className={`text-2xl font-bold ${score === words.length ? "text-emerald-600" : "text-indigo-600"}`}>{score}/{words.length} Correct</p></div><Btn onClick={() => onDone(words.map(w => ({ wid: w.id, correct: pairs[w.id] === w.id })))} className="w-full">Next →</Btn></div>}
    </div>;
}

function ResetModal({ onConfirm, onCancel }) {
    return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"><div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"><h3 className="font-bold text-gray-900 mb-2">⚠️ Reset All Data</h3><p className="text-sm text-gray-500 mb-5">This will permanently delete all study history, bookmarks, and word selections. This cannot be undone.</p><div className="flex gap-2"><Btn onClick={onConfirm} variant="danger" className="flex-1">Reset</Btn><Btn onClick={onCancel} variant="secondary" className="flex-1">Cancel</Btn></div></div></div>;
}

function HomeScreen({ history, weakWords, wordSel, nav, showApiKey, setShowApiKey, bookmarks, showReset, setShowReset, resetAll }) {
    const isLandscape = useOrientation();
    const [selected, setSelected] = useState([]);
    const MAX = 4;
    const toggle = id => { if (selected.includes(id)) { setSelected(s => s.filter(x => x !== id)); return; } if (selected.length >= MAX) return; setSelected(s => [...s, id]); };
    const getSetWords = s => wordSel[s.id]?.length ? s.words.filter(w => wordSel[s.id].includes(w.id)) : s.words;
    const selectedSets = SETS.filter(s => selected.includes(s.id));
    const combinedWords = selectedSets.flatMap(s => getSetWords(s));
    const setName = selectedSets.map(s => s.name).join(" + ");
    const bookmarkWords = SETS.flatMap(s => s.words).filter(w => bookmarks.has(w.id));
    return <div className="min-h-screen bg-gray-50">{showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} />}{showReset && <ResetModal onConfirm={resetAll} onCancel={() => setShowReset(false)} />}<div className={`mx-auto px-4 pt-5 pb-4 ${isLandscape ? "max-w-5xl" : "max-w-2xl"}`}><div className="flex items-center justify-between mb-4"><div><h1 className="text-2xl font-bold text-gray-900">📚 Vocabulary Study</h1><p className="text-sm text-gray-500">Select days · ✏️ pick words · 🔖 bookmarks</p></div><div className="flex gap-2"><Btn onClick={() => setShowApiKey(true)} variant="secondary" size="sm">🔑</Btn><Btn onClick={() => nav("dashboard")} variant="secondary" size="sm">📊 Stats</Btn><Btn onClick={() => setShowReset(true)} variant="secondary" size="sm">🗑️</Btn></div></div>{bookmarkWords.length > 0 && (<button onClick={() => nav("quiz_setup", { words: bookmarkWords, setName: "🔖 Bookmark Review", allWords: SETS.flatMap(s => s.words) })} className="w-full mb-3 px-4 py-3 rounded-2xl bg-yellow-50 border-2 border-yellow-300 text-left hover:bg-yellow-100 transition-all"><div className="flex items-center justify-between"><div><p className="font-bold text-yellow-800">🔖 Bookmark Review</p><p className="text-xs text-yellow-600">{bookmarkWords.length} words saved</p></div><span className="text-yellow-500 text-lg">→</span></div></button>)}{selected.length > 0 && (<div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 mb-4"><div className="flex items-center justify-between flex-wrap gap-2"><div><p className="text-sm font-semibold text-indigo-800">{setName}</p><p className="text-xs text-indigo-600">{combinedWords.length} words total</p></div><div className="flex gap-2 flex-wrap"><button onClick={() => nav("study", { words: combinedWords, setName, mode: 1, navTarget: "home" })} className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold">📖 Study 1</button><button onClick={() => nav("study", { words: combinedWords, setName, mode: 2, navTarget: "home" })} className="px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-semibold">🔤 Study 2</button><button onClick={() => nav("quiz_setup", { words: combinedWords, setName, allWords: combinedWords })} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold">▶ Quiz</button><button onClick={() => setSelected([])} className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-gray-500 text-xs font-semibold">✕</button></div></div></div>)}<div className={`grid gap-2 ${isLandscape ? "grid-cols-5" : "grid-cols-3"}`}>{SETS.map(s => { const h = history.filter(x => x.setId === s.id); const avg = h.length ? Math.round(h.reduce((a, x) => a + x.score, 0) / h.length) : null; const wk = weakWords[s.id] || {}; const wkCnt = Object.values(wk).filter(v => v.total >= 2 && v.wrong / v.total >= .4).length; const isSel = selected.includes(s.id); const isDisabled = !isSel && selected.length >= MAX; const selCnt = wordSel[s.id]?.length; return <div key={s.id} className="relative"><button onClick={() => !isDisabled && toggle(s.id)} disabled={isDisabled} className={`w-full rounded-2xl p-3 text-left transition-all border-2 ${isSel ? "border-indigo-500 bg-indigo-50 shadow-md" : isDisabled ? "border-gray-100 bg-gray-50 opacity-40" : "border-gray-100 bg-white hover:border-indigo-300 hover:shadow-sm"}`}>{isSel && <div className="absolute top-2 right-8 w-5 h-5 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold">{selected.indexOf(s.id) + 1}</div>}<p className="font-bold text-gray-800 text-sm pr-5">{s.name}</p><p className="text-xs text-gray-400 mt-0.5">{selCnt ? `${selCnt}/${s.words.length}` : s.words.length} words</p>{avg !== null && <p className="text-xs text-indigo-500 mt-0.5">Avg {avg}%</p>}{wkCnt > 0 && <p className="text-xs text-red-400 mt-0.5">{wkCnt} weak</p>}{h.length === 0 && <p className="text-xs text-gray-300 mt-0.5">Not studied</p>}</button><button onClick={e => { e.stopPropagation(); nav("word_select", { setId: s.id }); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 hover:bg-indigo-100 text-xs flex items-center justify-center transition-all">✏️</button></div>; })}</div></div></div>;
}

// ❌ 기존의 QuizSetupScreen 함수를 아래 코드로 교체하세요. ❌

function QuizSetupScreen({ words, setName, allWords, nav }) {
    const [type, setType] = useState("1");
    const [diff, setDiff] = useState("easy");

    const needsDiff = ["1", "2", "3", "mixed"].includes(type);
    const types = [
        { id: "1", l: "Type 1", d: "📖 Definition" },
        { id: "2", l: "Type 2", d: "✏️ Fill in Blank" },
        { id: "3", l: "Type 3", d: "🔄 Synonym/Antonym" },
        { id: "4", l: "Type 4", d: "🔗 Matching" },
        { id: "5", l: "Type 5", d: "🇰🇷 Korean→English" },
        { id: "mixed", l: "Mixed", d: "🎲 All Types" }
    ];

    // ✨✨✨ 여기를 수정된 코드로 교체합니다 ✨✨✨
    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => nav("home")} className="text-2xl text-gray-400">←</button>
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Quiz Setup</h2>
                    <p className="text-xs text-gray-400">{setName} · {words.length} words</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Quiz Type</p>
                    <div className="grid grid-cols-2 gap-2">
                        {types.map(t => (
                            <button key={t.id} onClick={() => setType(t.id)} className={`p-3 rounded-xl border text-left ${type === t.id ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`}>
                                <div className="text-xs font-bold text-gray-400">{t.l}</div>
                                <div className="text-sm text-gray-700 mt-0.5">{t.d}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {needsDiff && (
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Difficulty</p>
                        <div className="grid grid-cols-2 gap-2">
                            {/* ❗❗ 괄호 오류가 수정된 부분 ❗❗ */}
                            {[
                                ["easy", "🟢 Easy", "4 choices"],
                                ["hard", "🔴 Hard", "Type answer"]
                            ].map(([k, l, d]) => (
                                <button key={k} onClick={() => setDiff(k)} className={`p-3 rounded-xl border text-left ${diff === k ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`}>
                                    <div className="font-semibold text-sm">{l}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{d}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <Btn onClick={() => nav("quiz", { words, setName, allWords, config: { type, diff } })} size="lg" className="w-full">🚀 Start Quiz</Btn>
            </div>
        </div>
    );
}


function QuizScreen({ words, setName, allWords, config, nav, saveHistory, updateWeakWords }) {
    const [questions] = useState(() => buildQuestions(words, allWords, config.type, config.diff));
    const batches = useMemo(() => { if (!questions?.length) return []; const r = []; let c = []; questions.forEach(q => { if (q.t === 4) { if (c.length) { r.push(c); c = []; } r.push([q]); } else { c.push(q); if (c.length === 10) { r.push(c); c = []; } } }); if (c.length) r.push(c); return r; }, [questions]);
    const [batchIdx, setBatchIdx] = useState(0); const [qIdx, setQIdx] = useState(0); const [selected, setSelected] = useState(null); const [typed, setTyped] = useState(""); const [checked, setChecked] = useState(null); const [batchSummary, setBatchSummary] = useState(null); const allRef = useRef([]); const batchRef = useRef([]);
    if (!questions || !batches.length) return <div className="max-w-2xl mx-auto px-4 py-12 text-center"><div className="text-5xl mb-3">😅</div><p className="text-gray-600 mb-4">No suitable words found for this quiz type.</p><Btn onClick={() => nav("home")}>Home</Btn></div>;
    const cb = batches[batchIdx] || []; const q = cb[qIdx];
    const totalQ = questions.length; const doneQ = batches.slice(0, batchIdx).reduce((s, b) => s + b.length, 0) + qIdx;
    // 📍 in: function QuizScreen(...)

const finishQuiz = async allR => {
    const total = allR.length;
    if (!total) {
        nav("home");
        return;
    }
    const correct = allR.filter(r => r.correct).length;
    const wrongIds = [...new Set(allR.filter(r => !r.correct && r.wid).map(r => r.wid))];
    const allIds = [...new Set(allR.filter(r => r.wid).map(r => r.wid))];
    const score = Math.round(correct / total * 100);
    const setIds = [...new Set(words.map(w => SETS.find(s => s.words.some(sw => sw.id === w.id))?.id).filter(Boolean))];

    for (const sid of setIds) {
        const sW = wrongIds.filter(id => SETS.find(s => s.id === sid)?.words.some(w => w.id === id));
        const sA = allIds.filter(id => SETS.find(s => s.id === sid)?.words.some(w => w.id === id));

        // --- ✨ 여기에 wrongWordIds 추가 ---
        await saveHistory({
            id: uid(),
            setId: sid,
            date: new Date().toISOString(),
            type: config.type,
            diff: config.diff,
            score,
            correct,
            total,
            wrongWordIds: sW, // 틀린 단어 ID 배열을 함께 저장!
        });
        // ------------------------------------

        await updateWeakWords(sid, sW, sA);
    }
    nav("results", { wrongIds, words, setName, score, correct, total, config });
};

    const finishBatch = batchR => { const allR = [...allRef.current, ...batchR]; allRef.current = allR; if (batchIdx >= batches.length - 1) { finishQuiz(allR); return; } const wrongWids = [...new Set(batchR.filter(r => !r.correct && r.wid).map(r => r.wid))]; setBatchSummary({ batchNum: batchIdx + 1, totalBatches: batches.length, correct: batchR.filter(r => r.correct).length, total: batchR.length, wrongWords: words.filter(w => wrongWids.includes(w.id)) }); };
    const advQ = (batchR, qi, bat) => { batchRef.current = batchR; if (qi < bat.length - 1) { setQIdx(qi + 1); setSelected(null); setTyped(""); setChecked(null); } else finishBatch(batchR); };
    const handleMatchDone = res => finishBatch([...batchRef.current, ...res]);
    const check = () => { if (!q) return; const ua = q.opts ? selected : typed.trim().toLowerCase(); const correct = ua === q.ans.toLowerCase(); setChecked({ correct, ua }); if (correct) { const qi = qIdx; const bat = cb; const bR = [...batchRef.current, { wid: q.wid, correct: true }]; setTimeout(() => advQ(bR, qi, bat), 1000); } };
    const next = () => { if (!checked) return; const bR = [...batchRef.current, { wid: q.wid, correct: checked.correct }]; advQ(bR, qIdx, cb); };
    const continueBatch = () => { batchRef.current = []; setBatchSummary(null); setBatchIdx(i => i + 1); setQIdx(0); setSelected(null); setTyped(""); setChecked(null); };
    if (batchSummary) { const { batchNum, totalBatches, correct, total, wrongWords } = batchSummary; const pct = Math.round(correct / total * 100); return <div className="max-w-2xl mx-auto px-4 py-6"><Card className={`p-6 text-center mb-4 ${pct >= 80 ? "bg-emerald-50" : "bg-indigo-50"}`}><p className="text-xs font-bold text-gray-400 mb-1">Round {batchNum}/{totalBatches} Complete</p><div className={`text-6xl font-bold mb-1 ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-yellow-500" : "text-red-500"}`}>{pct}<span className="text-3xl">%</span></div><p className="text-gray-500">{correct}/{total} correct</p></Card>{wrongWords.length > 0 && <Card className="p-4 mb-4"><p className="font-semibold text-gray-700 mb-2">❌ Wrong</p><div className="divide-y divide-gray-50 max-h-36 overflow-y-auto">{wrongWords.map(w => <div key={w.id} className="flex justify-between py-1.5"><span className="font-medium text-gray-800 text-sm">{w.english}</span><span className="text-sm text-gray-500">{w.korean}</span></div>)}</div></Card>}<Btn onClick={continueBatch} size="lg" className="w-full">Next {batches[batchIdx + 1]?.length || 10} Questions →</Btn></div>; }
    if (!q) return null;
    return <div className="max-w-2xl mx-auto px-4 py-6"><div className="flex items-center gap-3 mb-4"><button onClick={() => nav("home")} className="text-2xl text-gray-400">←</button><div className="flex-1"><div className="flex justify-between text-xs text-gray-400 mb-1"><span>{q.label} · Round {batchIdx + 1}/{batches.length}</span><span>{doneQ + 1}/{totalQ}</span></div><ProgressBar value={doneQ + 1} max={totalQ} /></div></div><Card className="p-6">{q.t === 4 ? <MatchingQuiz key={q.id} q={q} onDone={handleMatchDone} /> : <> <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">{q.label}</span><div className="text-lg font-medium text-gray-800 mt-3 mb-4 leading-relaxed">{q.q}</div>{checked && <div className={`rounded-xl p-3 mb-3 border ${checked.correct ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>{checked.correct ? <p className="font-bold text-emerald-700">✓ Correct!</p> : <><p className="font-bold text-red-700">✗ Wrong</p><p className="text-sm text-gray-700 mt-1">Answer: <strong>{q.ans}</strong></p></>}</div>}{q.opts ? <div className="space-y-2">{q.opts.map(opt => { let cls = "border-gray-200 bg-white text-gray-800 hover:border-indigo-300"; if (checked) { if (opt === q.ans) cls = "border-emerald-400 bg-emerald-50 text-emerald-800"; else if (opt === selected) cls = "border-red-400 bg-red-50 text-red-700"; } else if (selected === opt) cls = "border-indigo-500 bg-indigo-50 text-indigo-700"; return <button key={opt} onClick={() => !checked && setSelected(opt)} className={`w-full py-2.5 px-4 rounded-xl border text-sm font-medium text-left transition-all ${cls}`}>{opt}</button>; })}</div> : <input autoFocus value={typed} onChange={e => !checked && setTyped(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { checked ? next() : check(); } }} disabled={!!checked} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Type the word..." />}<div className="mt-3">{!checked ? <Btn onClick={check} disabled={q.opts ? !selected : !typed.trim()} size="lg" className="w-full">Check</Btn> : checked.correct ? <p className="text-center text-sm text-gray-400">Moving on...</p> : <Btn onClick={next} size="lg" className="w-full">Next →</Btn>}</div></>} </Card></div>;
}

// 📍 app/page.jsx 파일에서 DashboardScreen 함수 전체를 교체하세요.

function DashboardScreen({ history, weakWords, nav }) {
    const total = history.length;
    const avg = total ? Math.round(history.reduce((a, h) => a + h.score, 0) / total) : 0;

    // 최신 10개의 기록만 가져옵니다.
    const recent = [...history].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    // --- ✨ 모든 단어를 쉽게 찾기 위한 헬퍼 데이터 ---
    const allWordsMap = useMemo(() => {
        const map = new Map();
        SETS.flatMap(s => s.words).forEach(w => map.set(w.id, w));
        return map;
    }, []);
    // ----------------------------------------------

    // 퀴즈 타입 ID를 사람이 읽기 좋은 이름으로 변환
    const quizTypeNames = {
        "1": "📖 Definition",
        "2": "✏️ Fill in Blank",
        "3": "🔄 Synonym/Antonym",
        "4": "🔗 Matching",
        "5": "🇰🇷 Korean→English",
        "mixed": "🎲 All Types"
    };

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => nav("home")} className="text-2xl text-gray-400">←</button>
                <h2 className="text-xl font-bold text-gray-900">📊 Study Stats</h2>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                    ["" + total, "Total Sessions"],
                    ["" + avg + "%", "Average Score"]
                ].map(([v, l]) => (
                    <Card key={l} className="p-4 text-center">
                        <div className="text-2xl font-bold text-indigo-600">{v}</div>
                        <div className="text-xs text-gray-500 mt-1">{l}</div>
                    </Card>
                ))}
            </div>

            {/* --- ✨ 'Recent History' UI 수정 --- */}
            {recent.length > 0 && (
                <Card className="p-4 mb-4">
                    <h3 className="font-semibold text-gray-700 mb-2">Recent History</h3>
                    <div className="divide-y divide-gray-100">
                        {recent.map(h => {
                            const s = SETS.find(x => x.id === h.setId);
                            const c = h.score >= 80 ? "text-emerald-600" : h.score >= 60 ? "text-yellow-500" : "text-red-500";
                            const wrongWords = h.wrongWordIds?.map(id => allWordsMap.get(id)).filter(Boolean) || [];

                            return (
                                <details key={h.id} className="py-2 group">
                                    <summary className="flex items-center justify-between cursor-pointer list-none">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-800">{s?.name || "—"} <span className="text-xs text-gray-400 font-normal ml-1">{quizTypeNames[h.type] || ''}</span></p>
                                            <p className="text-xs text-gray-400">{new Date(h.date).toLocaleDateString("en-US")}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`font-bold text-lg ${c}`}>{h.score}%</span>
                                            {wrongWords.length > 0 && (
                                                <span className="text-xs text-gray-400 group-open:rotate-90 transition-transform">▶</span>
                                            )}
                                        </div>
                                    </summary>

                                    {wrongWords.length > 0 && (
                                        <div className="mt-3 pl-2 border-l-2 border-red-200">
                                            <p className="text-xs font-bold text-red-500 mb-2">Wrong Words:</p>
                                            <div className="space-y-1">
                                                {wrongWords.map(w => (
                                                    <div key={w.id} className="flex justify-between text-sm">
                                                        <span className="font-medium text-gray-700">{w.english}</span>
                                                        <span className="text-gray-500">{w.korean}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </details>
                            );
                        })}
                    </div>
                </Card>
            )}
            {/* ------------------------------------- */}


            {SETS.map(s => {
                const wk = weakWords[s.id] || {};
                const wl = Object.entries(wk).filter(([, v]) => v.total >= 2 && v.wrong / v.total >= .4);
                if (!wl.length) return null;
                return (
                    <Card key={s.id} className="p-4 mb-3">
                        <h3 className="font-semibold text-gray-700 mb-2">⚠️ [{s.name}] Weak Words</h3>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {wl.map(([id, v]) => {
                                const w = allWordsMap.get(id);
                                return w ? <span key={id} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100">{w.english} ({Math.round(v.wrong / v.total * 100)}%)</span> : null;
                            })}
                        </div>
                        <Btn onClick={() => { const wkWords = wl.map(([id]) => allWordsMap.get(id)).filter(Boolean); nav("quiz_setup", { words: wkWords, setName: s.name + " Weak", allWords: s.words }); }} variant="secondary" size="sm">🔥 Review Weak Words</Btn>
                    </Card>
                );
            })}
        </div>
    );
}



export default function App() {
    const [screen, setScreen] = useState("home");
    const [navData, setNavData] = useState({});
    const [history, setHistory] = useState([]);
    const [weakWords, setWeakWords] = useState({});
    const [bookmarks, setBookmarks] = useState(new Set());
    const [wordSel, setWordSel] = useState({});
    const [ready, setReady] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [showReset, setShowReset] = useState(false);

    useEffect(() => {
        (async () => {
            const [h, w, b, ws] = await Promise.all([DB.get("history"), DB.get("weak"), DB.get("bookmarks"), DB.get("wordSel")]);
            setHistory(h || []);
            setWeakWords(w || {});
            setBookmarks(new Set(b || []));
            setWordSel(ws || {});
            setReady(true);
        })();
    }, []);

    const saveHistory = async entry => { const h = [...history, entry]; setHistory(h); await DB.set("history", h); };
    const updateWeakWords = async (setId, wrongIds, allIds) => { const wk = { ...weakWords }; if (!wk[setId]) wk[setId] = {}; allIds.forEach(id => { if (!wk[setId][id]) wk[setId][id] = { wrong: 0, total: 0 }; wk[setId][id].total++; }); wrongIds.forEach(id => { if (!wk[setId][id]) wk[setId][id] = { wrong: 0, total: 0 }; wk[setId][id].wrong++; }); setWeakWords(wk); await DB.set("weak", wk); };
    const toggleBookmark = id => { setBookmarks(prev => { const nb = new Set(prev); nb.has(id) ? nb.delete(id) : nb.add(id); DB.set("bookmarks", [...nb]); return nb; }); };
    const bookmarkWords = ids => { setBookmarks(prev => { const nb = new Set(prev); ids.forEach(id => nb.add(id)); DB.set("bookmarks", [...nb]); return nb; }); };
    const resetAll = async () => { setHistory([]); setWeakWords({}); setBookmarks(new Set()); setWordSel({}); await Promise.all([DB.set("history", []), DB.set("weak", {}), DB.set("bookmarks", []), DB.set("wordSel", {})]); setShowReset(false); };
    const saveWordSel = async (setId, ids) => { const nws = { ...wordSel, [setId]: ids }; setWordSel(nws); await DB.set("wordSel", nws); nav("home"); };

    const nav = (s, data = {}) => { setNavData(data); setScreen(s); window.scrollTo(0, 0); };

    if (!ready) return <div className="flex items-center justify-center min-h-screen bg-gray-50 text-center"><div className="text-5xl mb-3">📚</div><p className="text-gray-500">Loading...</p></div>;

    const props = { history, saveHistory, weakWords, updateWeakWords, nav, bookmarks, toggleBookmark, bookmarkWords };

    return (
        <div className="min-h-screen bg-gray-50">
            {screen === "home" && <HomeScreen {...props} wordSel={wordSel} showApiKey={showApiKey} setShowApiKey={setShowApiKey} showReset={showReset} setShowReset={setShowReset} resetAll={resetAll} />}
            {screen === "word_select" && <WordSelectScreen setId={navData.setId} wordSel={wordSel} onSave={saveWordSel} nav={nav} />}
            {screen === "study" && <StudyScreen {...props} words={navData.words} setName={navData.setName} mode={navData.mode || 1} navTarget={navData.navTarget || "home"} />}
            {screen === "quiz_setup" && <QuizSetupScreen {...props} words={navData.words} setName={navData.setName} allWords={navData.allWords} />}
            {screen === "quiz" && <QuizScreen {...props} words={navData.words} setName={navData.setName} allWords={navData.allWords} config={navData.config} />}
            {screen === "results" && <ResultsScreen {...props} wrongIds={navData.wrongIds} words={navData.words} setName={navData.setName} score={navData.score} correct={navData.correct} total={navData.total} config={navData.config} />}
            {screen === "dashboard" && <DashboardScreen {...props} />}
        </div>
    );
}
