import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Mic2, Send, Sparkles, Volume2, WandSparkles } from "lucide-react";
import type { User } from "firebase/auth";
import type { ChatMessage } from "../types";
import { generateRoomTutorDiagram, generateStudyAudio, askDocument } from "../services/omniEngine";
import { sendRoomMessage, type RoomDocumentItem } from "../services/firebaseData";

interface RoomTutorProps {
  roomId: string;
  roomName: string;
  user: User;
  boardNotes: string;
  messages: ChatMessage[];
  sharedDocuments: Pick<RoomDocumentItem, "name" | "textContent">[];
  onDiagram: (diagram: string) => Promise<void>;
  onNotice: (message: string) => void;
}

interface TutorTurn {
  id: string;
  role: "learner" | "teacher";
  text: string;
}

export default function RoomTutor({
  roomId,
  roomName,
  user,
  boardNotes,
  messages,
  sharedDocuments,
  onDiagram,
  onNotice,
}: RoomTutorProps) {
  const [language, setLanguage] = useState<"Arabic" | "English">("Arabic");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [diagramBusy, setDiagramBusy] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const lessonContext = useMemo(() => {
    const recentChat = messages.slice(-8).map((message) => `${message.name}: ${message.text}`).join("\n");
    const documentContext = sharedDocuments.length
      ? sharedDocuments.map((document) => `${document.name}\n${document.textContent || "(No selectable text extracted.)"}`).join("\n\n")
      : "No files shared yet.";
    return `ROOM: ${roomName}\nSHARED WHITEBOARD NOTES:\n${boardNotes || "(No notes yet.)"}\nSHARED DOCUMENTS AND EXTRACTED TEXT:\n${documentContext}\nRECENT ROOM DISCUSSION:\n${recentChat || "(No recent discussion.)"}`.slice(0, 18000);
  }, [boardNotes, messages, roomName, sharedDocuments]);

  useEffect(() => {
    if (!voiceUrl || !audioRef.current) return;
    void audioRef.current.play().catch(() => {
      setVoiceNotice("Tap play to hear the AI-generated voice.");
    });
  }, [voiceUrl]);

  useEffect(() => () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
  }, [voiceUrl]);

  async function speak(text: string) {
    setVoiceBusy(true);
    setVoiceNotice("");
    setError("");
    audioRef.current?.pause();
    try {
      const audioBlob = await generateStudyAudio(text);
      const nextUrl = URL.createObjectURL(audioBlob);
      setVoiceUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    } catch (caught) {
      if (!("speechSynthesis" in window)) {
        setVoiceNotice(caught instanceof Error ? `Voice unavailable: ${caught.message}` : "Voice output is unavailable in this browser.");
        setVoiceBusy(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === "Arabic" ? "ar-EG" : "en-US";
      const languagePrefix = language === "Arabic" ? "ar" : "en";
      const voice = window.speechSynthesis?.getVoices().find((item) => item.lang.toLowerCase().startsWith(languagePrefix));
      if (voice) utterance.voice = voice;
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setVoiceNotice("AI voice service is unavailable; using your device's built-in voice for now.");
      } else {
        setVoiceNotice(caught instanceof Error ? `Voice unavailable: ${caught.message}` : "Voice output is unavailable in this browser.");
      }
    } finally {
      setVoiceBusy(false);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || busy) return;
    setQuestion("");
    setError("");
    setTurns((current) => [...current, { id: crypto.randomUUID(), role: "learner", text: prompt }]);
    setBusy(true);
    try {
      try {
        await sendRoomMessage(user, roomId, `Question for the AI tutor: ${prompt}`);
      } catch (caught) {
        setError(`The tutor can still answer, but your question did not appear in room chat: ${caught instanceof Error ? caught.message : "unknown error"}`);
      }
      const answer = await askDocument(prompt, lessonContext, undefined, language);
      setTurns((current) => [...current, { id: crypto.randomUUID(), role: "teacher", text: answer }]);
      try {
        const sharedAnswer = answer.length > 1900 ? `${answer.slice(0, 1890)}…` : answer;
        await sendRoomMessage(user, roomId, sharedAnswer, true);
      } catch (caught) {
        setError(`The answer is ready but could not be shared with the room: ${caught instanceof Error ? caught.message : "unknown error"}`);
      }
      if (autoSpeak) await speak(answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The AI tutor could not answer. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function drawLessonMap() {
    setDiagramBusy(true);
    setError("");
    try {
      const learnerTurns = turns.filter((turn) => turn.role === "learner");
      const topic = learnerTurns[learnerTurns.length - 1]?.text ?? roomName;
      const diagram = await generateRoomTutorDiagram(topic, lessonContext, language);
      await onDiagram(diagram);
      onNotice("The AI tutor added a lesson map to the shared whiteboard.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The AI tutor could not draw the lesson map.");
    } finally {
      setDiagramBusy(false);
    }
  }

  function startVoiceQuestion() {
    const browserWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice questions are not supported by this browser. You can still type to the tutor.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language === "Arabic" ? "ar-EG" : "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setQuestion((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => {
      setError("The microphone could not capture that question. Check browser microphone permission.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  }

  return (
    <section className="room-tutor">
      <header className="room-tutor-header">
        <span className="room-tutor-icon"><Sparkles size={16} /></span>
        <div><h3>AI classroom tutor</h3><span>Ask questions during the session · Arabic or English</span></div>
        <label><span className="sr-only">Tutor language</span><select aria-label="Tutor response language" value={language} onChange={(event) => setLanguage(event.target.value as "Arabic" | "English")}><option value="Arabic">العربية</option><option value="English">English</option></select></label>
      </header>
      <div className="room-tutor-notice">The tutor uses shared notes, extracted text from supported documents, and recent chat; this context is sent to OmniLearn AI/OpenRouter.</div>
      <div className="tutor-transcript" aria-live="polite">
        {!turns.length && <div className="tutor-welcome"><Sparkles size={18} /><p>I'm your AI tutor. Ask me to explain an idea, walk through an example, or connect concepts from the room.</p></div>}
        {turns.map((turn) => <article className={`tutor-turn ${turn.role}`} key={turn.id}><span>{turn.role === "teacher" ? "OMNI TUTOR" : "YOU"}</span><p>{turn.text}</p></article>)}
        {busy && <div className="tutor-thinking"><LoaderCircle size={15} className="spin" /> The tutor is thinking…</div>}
        {voiceUrl && <audio ref={audioRef} controls src={voiceUrl} aria-label="AI tutor spoken response" />}
      </div>
      {voiceNotice && <p className="tutor-voice-notice" role="status">{voiceNotice}</p>}
      {error && <p className="inline-error tutor-error" role="alert">{error}</p>}
      <div className="room-tutor-actions">
        <button className={`tutor-toggle ${autoSpeak ? "active" : ""}`} onClick={() => setAutoSpeak((current) => !current)} aria-pressed={autoSpeak}><Volume2 size={14} /> {autoSpeak ? "Voice on" : "Voice off"}</button>
        <button className="tutor-toggle" disabled={busy || diagramBusy} onClick={() => void drawLessonMap()}>{diagramBusy ? <LoaderCircle size={14} className="spin" /> : <WandSparkles size={14} />} Draw lesson map</button>
        {turns[turns.length - 1]?.role === "teacher" && <button className="tutor-toggle" disabled={voiceBusy} onClick={() => void speak(turns[turns.length - 1].text)}>{voiceBusy ? <LoaderCircle size={14} className="spin" /> : <Volume2 size={14} />} Speak again</button>}
      </div>
      <form className="tutor-composer" onSubmit={(event) => void ask(event)}>
        <label className="sr-only" htmlFor={`tutor-question-${roomId}`}>Ask the AI tutor a question</label>
        <textarea id={`tutor-question-${roomId}`} rows={2} maxLength={1500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask your teacher a question…" />
        <div>
          <button type="button" className={`tutor-mic-button ${listening ? "listening" : ""}`} onClick={listening ? () => recognitionRef.current?.stop() : startVoiceQuestion} aria-label={listening ? "Stop voice question" : "Ask by voice"} title={listening ? "Stop listening" : "Ask by voice"}><Mic2 size={16} /></button>
          <button type="submit" className="send-button" disabled={busy || !question.trim()} aria-label="Send question to AI tutor"><Send size={15} /></button>
        </div>
      </form>
    </section>
  );
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
