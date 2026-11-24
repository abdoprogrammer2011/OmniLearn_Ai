import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, FileText, LoaderCircle, MessageCircle, Network, ShieldCheck, Sparkles, UploadCloud, Volume2, X } from "lucide-react";
import MermaidDiagram from "./MermaidDiagram";
import type { Flashcard } from "../types";
import type { User } from "firebase/auth";
import { logActivity, saveQuizScore } from "../services/firebaseData";
import { askDocument, generateStudyAudio, generateStudyGuide, type StudyAIResult } from "../services/omniEngine";

type StudyTab = "summary" | "quiz" | "flashcards" | "ask";

export default function StudyWorkspace({ user }: { user: User }) {
  const [sourceImage, setSourceImage] = useState("");
  const [responseLanguage, setResponseLanguage] = useState<"English" | "Arabic">("English");
  const [fileName, setFileName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [insights, setInsights] = useState<StudyAIResult | null>(null);
  const [tab, setTab] = useState<StudyTab>("summary");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [scoreError, setScoreError] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState("");
  const savedScore = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSource = Boolean(draftNotes.trim() || sourceImage);
  const hasInsights = insights !== null;
  const cards = insights?.flashcards ?? [];
  const quiz = insights?.quiz ?? [];
  const mindMap = useMemo(() => {
    const concepts = insights?.concepts ?? [];
    const lines = concepts.map((concept, index) => `    core --> concept${index}["${concept.replace(/[\r\n]+/g, " ").replace(/"/g, "#quot;")}"]`).join("\n");
    return `flowchart TD\n    root(["Your notes"]) --> core["Core ideas"]\n${lines}`;
  }, [insights?.concepts]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function createVoiceSummary() {
    if (!insights || audioBusy) return;
    setAudioBusy(true);
    setAudioError("");
    setAudioUrl("");
    try {
      const narration = insights.summary.join(". ");
      const audio = await generateStudyAudio(narration);
      setAudioUrl(URL.createObjectURL(audio));
    } catch (caught) {
      setAudioError(caught instanceof Error ? caught.message : "The voice summary could not be generated.");
    } finally {
      setAudioBusy(false);
    }
  }

  function downloadStudyGuide() {
    if (!hasSource || !insights) return;
    const markdown = [
      `# ${fileName.replace(/\.[^/.]+$/, "")}`,
      "",
      "## Key takeaways",
      ...insights.summary.map((item) => `- ${item}`),
      "",
      "## Flashcards",
      ...cards.flatMap((card) => [`### ${card.question}`, card.answer, ""]),
      "",
      "## Practice quiz",
      ...quiz.flatMap((item) => [`### ${item.question}`, ...item.options.map((option, index) => `${index === item.correct ? "✓" : " "} ${option}`), `Answer: ${item.explanation}`, ""]),
      "## Concept map (Mermaid)",
      "```mermaid",
      mindMap,
      "```",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^/.]+$/, "") || "study-guide"}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 20 * 1024 * 1024) {
      setError("This file exceeds the 20 MB upload limit.");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) {
      setBusy(true);
      try {
        const image = await resizeStudyImage(file);
        setDraftNotes("");
        setSourceImage(image);
        setFileName(file.name);
        setInsights(null);
        setAudioUrl("");
        setAudioError("");
        setTab("summary");
        setCardIndex(0);
        setAnswers({});
        savedScore.current = false;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "This image could not be read.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (extension !== "pdf" && extension !== "txt") {
      setError("Choose a PDF, TXT, JPG, PNG, or WebP file.");
      return;
    }
    setBusy(true);
    try {
      let text: string;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const [{ default: workerUrl }, pdfjs] = await Promise.all([
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          import("pdfjs-dist"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
          const page = await document.getPage(index + 1);
          const content = await page.getTextContent();
          return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        }));
        text = pages.join("\n").trim();
        if (!text) throw new Error("No readable text found. This PDF may contain scanned images instead of selectable text.");
      } else {
        text = await file.text();
      }
      if (!text.trim()) throw new Error("This file does not contain any readable text.");
      if (text.length > 40_000) throw new Error("This document contains more than 40,000 characters. Paste a shorter section to create a study guide.");
      setSourceImage("");
      setDraftNotes(text);
      setFileName(file.name);
      setInsights(null);
      setAudioUrl("");
      setAudioError("");
      setTab("summary");
      setCardIndex(0);
      setAnswers({});
      savedScore.current = false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This file could not be read. Try a PDF or plain text file.");
    } finally {
      setBusy(false);
    }
  }

  async function createGuide() {
    const text = draftNotes.trim();
    if (!text && !sourceImage) {
      setError("Upload study material or paste your notes before creating a guide.");
      return;
    }
    if (text.length > 40_000) {
      setError("Your notes exceed the 40,000-character AI request limit. Shorten the text and try again.");
      return;
    }
    setError("");
    const title = fileName || "Pasted notes";
    setFileName(title);
    setTab("summary");
    setCardIndex(0);
    setAnswers({});
    setInsights(null);
    setAudioUrl("");
    setAudioError("");
    savedScore.current = false;
    setBusy(true);
    try {
      const generated = await generateStudyGuide(text, sourceImage || undefined, responseLanguage);
      setInsights(generated);
      try {
        await logActivity(user.uid, {
          action: "Document analyzed",
          module: "study",
          title,
          characterCount: text.length,
        });
      } catch (caught) {
        setError(`The study guide is ready, but history could not be saved: ${caught instanceof Error ? caught.message : "Unknown error"}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The study guide could not be generated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { void handleFile(event.target.files?.[0]); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); if (!busy) void handleFile(event.dataTransfer.files?.[0]); }

  async function askAboutDocument(event: FormEvent) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || !hasSource || askBusy) return;
    setAskBusy(true);
    setAskError("");
    setAnswer("");
    try {
      const response = await askDocument(prompt, draftNotes.trim(), sourceImage || undefined, responseLanguage);
      setAnswer(response);
      try {
        await logActivity(user.uid, {
          action: "Ask document",
          module: "study",
          title: fileName || "Study material",
          characterCount: prompt.length + draftNotes.length,
        });
      } catch (caught) {
        setAskError(`Your answer is ready, but history could not be saved: ${caught instanceof Error ? caught.message : "Unknown error"}`);
      }
    } catch (caught) {
      setAskError(caught instanceof Error ? caught.message : "Your document could not be answered. Please try again.");
    } finally {
      setAskBusy(false);
    }
  }

  async function answerQuestion(questionIndex: number, answerIndex: number) {
    const nextAnswers = { ...answers, [questionIndex]: answerIndex };
    setAnswers(nextAnswers);
    setScoreError("");
    if (!savedScore.current && Object.keys(nextAnswers).length === quiz.length) {
      savedScore.current = true;
      const correct = quiz.reduce((score, item, index) => score + (nextAnswers[index] === item.correct ? 1 : 0), 0);
      try {
        await saveQuizScore(user.uid, { title: fileName, correct, total: quiz.length });
      } catch (caught) {
        savedScore.current = false;
        setScoreError(`Your answers were checked, but the score could not be saved: ${caught instanceof Error ? caught.message : "Unknown error"}`);
      }
    }
  }

  return (
    <div className="page-content module-page study-page">
      <div className="module-heading study-heading">
        <div><div className="module-breadcrumb"><span className="module-icon study-module-icon"><BookOpen size={16} /></span> DOCUMENT INTELLIGENCE</div><h1>Turn notes into know-how.</h1><p>Upload a document or paste notes to build a study guide from your material.</p></div>
        <span className="quiet-button study-engine-label"><CircleHelp size={15} /> OmniLearn AI Engine</span>
      </div>
      <div className="study-layout">
        <aside className="study-source">
          <div className="source-heading"><div><p className="section-kicker">YOUR SOURCE</p><h3>Study material</h3></div><span className="source-format-label">PDF · TXT · IMAGE</span></div>
          <label className="study-language-label">Guide and voice language<select value={responseLanguage} disabled={busy || askBusy} onChange={(event) => setResponseLanguage(event.target.value as "English" | "Arabic")}><option>English</option><option>Arabic</option></select></label>
          <div className={`upload-zone ${dragging ? "dragging" : ""}`} aria-disabled={busy} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => { if (!busy) inputRef.current?.click(); }}>
            <input ref={inputRef} type="file" accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,text/plain,application/pdf,image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={onFileChange} />
            <div className="upload-icon">{busy ? <LoaderCircle size={20} className="spin" /> : <UploadCloud size={20} />}</div>
            <strong>{busy ? "Reading your file…" : "Drop a file to get started"}</strong>
            <span>or <u>browse files</u> on your device</span><small>PDF, TXT, JPG, PNG, or WebP · up to 20 MB</small>
          </div>
          {error && <p className="inline-error file-error" role="alert">{error}</p>}
          <label className="paste-notes-label" htmlFor="paste-study-notes">Or paste your notes</label>
          <textarea className="paste-notes-input" id="paste-study-notes" disabled={busy} value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} placeholder="Paste lecture notes or study material here…" maxLength={40000} />
          <button className="use-notes-button" onClick={() => void createGuide()} disabled={(!draftNotes.trim() && !sourceImage) || busy}>{busy ? <LoaderCircle size={14} className="spin" /> : null} {insights ? "Regenerate study guide" : "Create study guide"} <ArrowRight size={14} /></button>
          {hasSource && <div className="source-file"><div className="pdf-icon"><FileText size={18} /></div><div className="source-file-info"><strong>{fileName || "Pasted notes"}</strong><span>{insights ? "Study guide ready" : "Source ready · not saved to your account"}</span></div><button disabled={busy || askBusy} aria-label="Remove source" onClick={() => { setFileName(""); setSourceImage(""); setDraftNotes(""); setInsights(null); setAudioUrl(""); setAudioError(""); setQuestion(""); setAnswer(""); setAskError(""); setAnswers({}); savedScore.current = false; }}><X size={15} /></button></div>}
          <div className="source-divider" />
          <div className="source-tip"><span><ShieldCheck size={14} /></span><div><strong>Your material stays out of OmniLearn storage</strong><p>Text or images are sent to the OmniLearn AI Engine for analysis; the summary is sent for speech only when requested. OmniLearn stores only activity metadata.</p></div></div>
        </aside>
        <main className="study-results">
          <div className="study-file-title"><div className="study-file-mark"><FileText size={17} /></div><div><strong>{hasSource ? (fileName || "Pasted notes").replace(/\.[^/.]+$/, "") : "No study material yet"}</strong><span>{insights ? "Study guide · OmniLearn AI Engine" : hasSource ? "Source is ready for analysis" : "Upload a PDF or paste notes to get started"}</span></div><button className="icon-button" aria-label="Download study guide" onClick={downloadStudyGuide} disabled={!hasInsights}><ArrowDownToLine size={16} /></button></div>
          <div className="study-tabs" role="tablist"><button disabled={!hasInsights} aria-selected={tab === "summary"} className={tab === "summary" ? "selected" : ""} onClick={() => setTab("summary")} role="tab"><Network size={14} /> Summary & mind map</button><button disabled={!hasInsights} aria-selected={tab === "quiz"} className={tab === "quiz" ? "selected" : ""} onClick={() => setTab("quiz")} role="tab"><Sparkles size={14} /> Practice quiz <span className="tab-count">{String(quiz.length).padStart(2, "0")}</span></button><button disabled={!hasInsights} aria-selected={tab === "flashcards"} className={tab === "flashcards" ? "selected" : ""} onClick={() => setTab("flashcards")} role="tab"><BookOpen size={14} /> Flashcards <span className="tab-count">{cards.length.toString().padStart(2, "0")}</span></button><button disabled={!hasSource || busy || askBusy} aria-selected={tab === "ask"} className={tab === "ask" ? "selected" : ""} onClick={() => setTab("ask")} role="tab"><MessageCircle size={14} /> Ask your document</button></div>
          {hasInsights && <div className="study-audio-panel"><button className="quiet-button" disabled={audioBusy} onClick={() => void createVoiceSummary()}>{audioBusy ? <LoaderCircle className="spin" size={15} /> : <Volume2 size={15} />}{audioBusy ? "Creating voice summary…" : "Listen to summary"}</button>{audioUrl && <audio controls preload="none" src={audioUrl} aria-label="Audio summary of study material" />}{audioError && <p className="inline-error" role="alert">{audioError}</p>}</div>}
          {!hasSource && <div className="study-empty-state"><span><BookOpen size={25} /></span><h3>Your study guide starts with your material</h3><p>Upload a PDF, TXT, or image, then choose Create study guide. Extracted text or images are sent to OpenRouter for analysis.</p></div>}
          {hasSource && !hasInsights && <div className="study-empty-state">{busy ? <LoaderCircle size={25} className="spin" /> : <span><Sparkles size={25} /></span>}<h3>{busy ? "Creating your study guide…" : "Your source is ready"}</h3><p>{busy ? "Your study material is being analyzed securely. This may take a few moments." : "Choose Create study guide to generate a summary, concept map, quiz, and flashcards."}</p></div>}
          {hasSource && insights && tab === "summary" && <div className="study-tab-content"><div className="content-subheading"><div><h3>At a glance</h3><p>Key ideas extracted from your source material.</p></div><span className="ai-made"><Sparkles size={12} /> OmniLearn AI Engine</span></div><div className="summary-layout"><div className="summary-copy"><h4>Key takeaways</h4><ul>{insights.summary.map((point, index) => <li key={index}><span className="takeaway-number">0{index + 1}</span><span>{point}</span></li>)}</ul><button className="primary-button study-start-button" onClick={() => setTab("quiz")}>Test what you know <ArrowRight size={15} /></button></div><div className="mindmap-card"><div className="mindmap-heading"><strong>Concept map</strong><span className="mindmap-local-label">AI-generated concepts</span></div><MermaidDiagram chart={mindMap} compact /></div></div></div>}
          {hasSource && insights && tab === "quiz" && <div className="study-tab-content"><div className="content-subheading"><div><h3>Quick knowledge check</h3><p>Questions are based on your source material.</p></div><span className="quiz-score"><Check size={13} /> {Object.values(answers).filter((answer, index) => answer === quiz[index]?.correct).length}/{Object.keys(answers).length} correct</span></div>{scoreError && <p className="inline-error" role="alert">{scoreError}</p>}<div className="quiz-list">{quiz.map((item, questionIndex) => <div className="quiz-question" key={item.question}><p><span>0{questionIndex + 1}</span>{item.question}</p><div className="quiz-options">{item.options.map((option, optionIndex) => <button key={option} onClick={() => void answerQuestion(questionIndex, optionIndex)} className={answers[questionIndex] === optionIndex ? optionIndex === item.correct ? "correct" : "incorrect" : ""}><span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>{option}{answers[questionIndex] === optionIndex && (optionIndex === item.correct ? <Check size={14} /> : <X size={14} />)}</button>)}</div>{answers[questionIndex] !== undefined && <p className="quiz-feedback">{item.explanation}</p>}</div>)}</div></div>}
          {hasSource && insights && tab === "flashcards" && <Flashcards cards={cards} index={cardIndex} setIndex={setCardIndex} flipped={flipped} setFlipped={setFlipped} />}
          {hasSource && tab === "ask" && <form className="study-tab-content ask-document" onSubmit={(event) => void askAboutDocument(event)}><div className="content-subheading"><div><h3>Ask your document</h3><p>Get a source-grounded answer in {responseLanguage}.</p></div><span className="ai-made"><MessageCircle size={12} /> Gemma</span></div><label htmlFor="document-question">Your question</label><textarea id="document-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} placeholder="Ask a question about this material…" disabled={askBusy} /><button className="primary-button" disabled={!question.trim() || askBusy}>{askBusy ? <LoaderCircle size={15} className="spin" /> : <MessageCircle size={15} />}{askBusy ? "Finding an answer…" : "Ask document"}<ArrowRight size={14} /></button>{askError && <p className="inline-error" role="alert">{askError}</p>}{answer && <section className="document-answer" aria-live="polite"><h4>Answer</h4><p>{answer}</p></section>}</form>}
          {hasSource && insights && <div className="study-footer"><span><Sparkles size={12} /> AI-generated study content can contain errors. Check it against your source.</span><button onClick={() => setTab("flashcards")}>Review flashcards <ArrowRight size={13} /></button></div>}
        </main>
      </div>
    </div>
  );
}

function Flashcards({ cards, index, setIndex, flipped, setFlipped }: { cards: Flashcard[]; index: number; setIndex: (index: number) => void; flipped: boolean; setFlipped: (flipped: boolean) => void }) {
  const card = cards[index] ?? cards[0];
  if (!card) return null;
  function move(direction: number) { setIndex((index + direction + cards.length) % cards.length); setFlipped(false); }
  return <div className="study-tab-content flashcard-content"><div className="content-subheading"><div><h3>Remember more, effortlessly.</h3><p>Try to recall the answer before flipping the card.</p></div><span className="card-counter">{String(index + 1).padStart(2, "0")} <i>/</i> {String(cards.length).padStart(2, "0")}</span></div><button className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}><span className="flashcard-label">{flipped ? "THE ANSWER" : "THINK ABOUT IT"}</span><strong>{flipped ? card.answer : card.question}</strong><span className="flashcard-hint">{flipped ? "Click to see question" : "Click card to reveal answer"}</span><Sparkles className="flashcard-sparkle" size={18} /></button><div className="flashcard-controls"><button onClick={() => move(-1)} aria-label="Previous card"><ArrowLeft size={16} /></button><button className="know-button" onClick={() => move(1)}>Got it <Check size={14} /></button><button onClick={() => move(1)} aria-label="Next card"><ArrowRight size={16} /></button></div></div>;
}

async function resizeStudyImage(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null = null;
    for (const quality of [0.8, 0.68, 0.55]) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 2_800_000) break;
    }
    if (!blob || blob.size > 2_800_000) throw new Error("This image is too large to send. Choose a smaller image.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } finally {
    image.close();
  }
}
