import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, Bug, Check, ChevronDown, Copy, FileCode2, Gauge, GitBranch, Languages, LoaderCircle, Plus, ShieldCheck, Sparkles, WandSparkles, X } from "lucide-react";
import type { User } from "firebase/auth";
import type { CodeLanguage } from "../types";
import { generateCodeAssistance, type CodeAIResult } from "../services/omniEngine";
import { logActivity } from "../services/firebaseData";
import MermaidDiagram from "./MermaidDiagram";

type Action = "explain" | "flowchart" | "debug" | "translate" | "complexity";
const languages: CodeLanguage[] = ["Python", "JavaScript", "C++", "Rust"];
const actionLabels: Record<Action, string> = { explain: "Explain code", flowchart: "Generate flowchart", debug: "Bug hunter", translate: "Translate code", complexity: "Big-O complexity" };

export default function CodeWorkspace({ user }: { user: User }) {
  const [language, setLanguage] = useState<CodeLanguage>("Python");
  const [responseLanguage, setResponseLanguage] = useState<"English" | "Arabic">("English");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Action | null>(null);
  const [aiResult, setAIResult] = useState<CodeAIResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [target, setTarget] = useState<CodeLanguage>("JavaScript");
  const [error, setError] = useState("");
  const [tipVisible, setTipVisible] = useState(true);
  const lineCount = useMemo(() => Math.max(code.split("\n").length, 12), [code]);

  function switchLanguage(value: CodeLanguage) {
    setLanguage(value);
    setTarget(value === "Python" ? "JavaScript" : "Python");
    setCode("");
    setResult(null);
    setAIResult(null);
  }

  function startNewSession() {
    setCode("");
    setResult(null);
    setAIResult(null);
    setError("");
  }

  async function runAction(action: Action, targetLanguage = target) {
    if (busy) return;
    if (!code.trim()) {
      setError("Add some code before asking Omni to help.");
      return;
    }
    if (code.length > 30_000) {
      setError("Code must be 30,000 characters or fewer.");
      return;
    }
    setError("");
    setResult(action);
    setAIResult(null);
    setBusy(true);
    try {
      const task = action === "explain" ? "explain" : action === "flowchart" ? "flowchart" : action === "debug" ? "bug_hunter" : action === "translate" ? "translate" : "complexity";
      const generated = await generateCodeAssistance(task, code, language, action === "translate" ? targetLanguage : undefined, responseLanguage);
      setAIResult(generated);
      try {
        await logActivity(user.uid, {
          action,
          module: "code",
          title: `${actionLabels[action]} · ${language}${action === "translate" ? ` → ${targetLanguage}` : ""}`,
          language,
          characterCount: code.length,
        });
      } catch (caught) {
        setError(`The AI response is ready, but history could not be saved: ${caught instanceof Error ? caught.message : "Unknown error"}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The AI request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Clipboard access is unavailable. Select and copy the code manually.");
    }
  }

  function downloadCode() {
    const extension = language === "C++" ? "cpp" : language.toLowerCase();
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `playground.${extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="page-content module-page code-page">
      <div className="module-heading">
        <div><div className="module-breadcrumb"><span className="module-icon code-module-icon"><FileCode2 size={16} /></span> CODE INTELLIGENCE</div><h1>Make code make sense.</h1><p>Explore, understand, and improve code — one good question at a time.</p></div>
        <div className="module-heading-actions"><button className="primary-button small-primary" disabled={busy} onClick={startNewSession}><Plus size={15} /> New session</button></div>
      </div>
      <div className="code-layout">
        <section className="editor-card">
          <div className="editor-toolbar"><div className="file-tab"><span className="file-dot" /> playground<span className="file-ext">.{language === "C++" ? "cpp" : language.toLowerCase()}</span><span className="unsaved-dot" /></div>
            <div className="editor-tools"><label className="select-wrap"><span className="language-pill">{language}</span><ChevronDown size={13} /><select aria-label="Programming language" disabled={busy} value={language} onChange={(event) => switchLanguage(event.target.value as CodeLanguage)}>{languages.map((item) => <option key={item}>{item}</option>)}</select></label><button className="editor-icon-button" disabled={busy} onClick={copyCode} aria-label="Copy code">{copied ? <Check size={15} /> : <Copy size={15} />}</button><button className="editor-icon-button" disabled={busy} onClick={downloadCode} aria-label="Download code"><ArrowDownToLine size={15} /></button></div>
          </div>
          <div className="editor-body"><div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div><textarea className="code-input" disabled={busy} spellCheck={false} aria-label="Code editor" placeholder="Paste or write your code here…" value={code} onChange={(event) => setCode(event.target.value)} /></div>
          <div className="editor-status"><span><span className="status-ready" /> Ready</span><span>{language} <i /> UTF-8 <i /> LF</span></div>
        </section>
        <section className="assistant-card">
          <div className="assistant-header"><div className="assistant-title"><span className="assistant-spark"><Sparkles size={15} /></span><div><strong>OmniLearn AI Engine</strong><small>Nemotron · automatic Gemma fallback</small></div></div><label className="assistant-language"><span className="sr-only">AI response language</span><select aria-label="AI response language" disabled={busy} value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value as "English" | "Arabic")}><option>English</option><option>Arabic</option></select></label></div>
          <div className="assistant-content">
            <p className="assistant-prompt">What would you like to do with your code?</p>
            <div className="action-grid">
              <ActionButton icon={<Sparkles size={16} />} label="Explain code" detail="Step-by-step breakdown" color="lavender" disabled={busy} onClick={() => void runAction("explain")} />
              <ActionButton icon={<GitBranch size={16} />} label="Flowchart" detail="Visualize the logic" color="mint" disabled={busy} onClick={() => void runAction("flowchart")} />
              <ActionButton icon={<Bug size={16} />} label="Bug hunter" detail="Find & fix issues" color="peach" disabled={busy} onClick={() => void runAction("debug")} />
              <ActionButton icon={<Languages size={16} />} label="Translate" detail="Switch languages" color="blue" disabled={busy} onClick={() => void runAction("translate")} />
              <ActionButton icon={<Gauge size={16} />} label="Big-O complexity" detail="Time & space analysis" color="mint" disabled={busy} onClick={() => void runAction("complexity")} />
            </div>
            {error && <p className="inline-error" role="alert">{error}</p>}
            {result ? <div className="result-area">
              <div className="result-title"><span className="result-spark"><Sparkles size={13} /></span><strong>{actionLabels[result]}</strong><button onClick={() => { setResult(null); setAIResult(null); }} aria-label="Close result"><X size={14} /></button></div>
              {busy ? <div className="result-loading"><LoaderCircle size={15} className="spin" /> OmniLearn AI is reviewing your code…</div> : aiResult ? <ResultContent result={aiResult} language={language} target={target} onTarget={(value) => { setTarget(value); void runAction("translate", value); }} originalCode={code} /> : <div className="translation-unavailable"><Sparkles size={15} /><span><strong>No response was generated.</strong><small>Review the message above and try again.</small></span></div>}
            </div> : <div className="assistant-empty"><div className="empty-orbit"><Sparkles size={19} /></div><strong>A fresh perspective, one click away.</strong><span>Choose an action above to get started.</span></div>}
          </div>
          <div className="assistant-footnote"><ShieldCheck size={12} /> Code is sent to the OmniLearn AI Engine. Review all generated code before use.</div>
        </section>
      </div>
      {tipVisible && <div className="tip-strip"><span><WandSparkles size={15} /></span><p><strong>Tip</strong> &nbsp;AI requests are protected by Firebase Authentication and sent from a secure server function.</p><button onClick={() => setTipVisible(false)} aria-label="Dismiss tip"><X size={14} /></button></div>}
    </div>
  );
}

function ActionButton({ icon, label, detail, color, disabled, onClick }: { icon: React.ReactNode; label: string; detail: string; color: string; disabled: boolean; onClick: () => void }) {
  return <button className="code-action" disabled={disabled} onClick={onClick}><span className={`action-icon ${color}`}>{icon}</span><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={14} className="action-chevron" /></button>;
}

function ResultContent({ result, language, target, onTarget, originalCode }: {
  result: CodeAIResult;
  language: CodeLanguage;
  target: CodeLanguage;
  onTarget: (language: CodeLanguage) => void;
  originalCode: string;
}) {
  if ("mermaid" in result) return <div className="result-diagram"><MermaidDiagram chart={result.mermaid} compact /></div>;
  if ("timeComplexity" in result) {
    return <div className="explanation-result complexity-result"><div className="complexity-values"><div><span>TIME</span><strong>{result.timeComplexity}</strong></div><div><span>AUXILIARY SPACE</span><strong>{result.spaceComplexity}</strong></div></div><p>{result.explanation}</p>{result.assumptions.length > 0 && <div><strong>Assumptions</strong><ul>{result.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</div>;
  }
  if ("translatedCode" in result) {
    return <div className="translation-result"><div className="translation-picker"><span>Translate to</span><select value={target} onChange={(event) => onTarget(event.target.value as CodeLanguage)}>{languages.filter((item) => item !== language).map((item) => <option key={item}>{item}</option>)}</select></div><p className="translation-notice">{result.notes}</p><pre>{result.translatedCode}</pre></div>;
  }
  if ("findings" in result) {
    return <div className="explanation-result"><div className="finding-banner"><Bug size={14} /><span><strong>{result.findings.length ? `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}` : "No concrete issue found"}</strong><small>{result.explanation}</small></span></div>{result.findings.map((finding, index) => <div className={`ai-finding severity-${finding.severity}`} key={`${finding.line}-${index}`}><span>{finding.line ? `LINE ${finding.line}` : "GENERAL"} · {finding.severity.toUpperCase()}</span><p>{finding.issue}</p><small>{finding.fix}</small></div>)}{result.correctedCode && result.correctedCode !== originalCode && <div className="fixed-code"><strong>Suggested corrected code</strong><pre>{result.correctedCode}</pre></div>}<span className="result-disclaimer">AI review can miss issues. Verify changes and run your tests before use.</span></div>;
  }
  return <div className="explanation-result"><div className="explanation-summary"><span className="summary-badge">OVERVIEW</span><p>{result.summary}</p></div><div className="line-breakdown">{result.breakdown.map((line, index) => <div className="breakdown-row" key={`${line.code}-${index}`}><code>{line.code}</code><span>{line.explanation}</span></div>)}</div><span className="result-disclaimer">Generated by OmniLearn AI Engine · Verify details before relying on them.</span></div>;
}
