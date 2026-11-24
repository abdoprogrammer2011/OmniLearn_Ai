import { FormEvent, useState } from "react";
import type { User } from "firebase/auth";
import { Bug, CheckCircle2, LoaderCircle, MessageSquareWarning, ShieldAlert, X } from "lucide-react";
import { createReport, type ReportInput } from "../services/firebaseData";

const categories: { value: ReportInput["category"]; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug or technical issue", icon: Bug },
  { value: "abuse", label: "Abuse or harmful behavior", icon: ShieldAlert },
  { value: "content", label: "Inappropriate content", icon: MessageSquareWarning },
];

export default function ReportIssueModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [category, setCategory] = useState<ReportInput["category"]>("bug");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createReport(user, {
        category,
        description: description.trim(),
        ...(roomId.trim() ? { roomId: roomId.trim() } : {}),
        ...(targetUserId.trim() ? { targetUserId: targetUserId.trim() } : {}),
      });
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your report could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="search-overlay report-overlay" onMouseDown={onClose}><section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(event) => event.stopPropagation()}><div className="report-modal-header"><div><span className="module-icon report-icon"><MessageSquareWarning size={17} /></span><div><p className="section-kicker">HELP US KEEP OMNILEARN SAFE</p><h2 id="report-title">Report an issue</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Close report form"><X size={17} /></button></div>{submitted ? <div className="report-success"><span><CheckCircle2 size={23} /></span><h3>Thanks for speaking up.</h3><p>Your report is securely in the moderation queue. Only authorized admins can review it.</p><button className="primary-button" onClick={onClose}>Done</button></div> : <form onSubmit={(event) => void submit(event)}><label className="report-field"><span>What would you like to report?</span><select value={category} onChange={(event) => setCategory(event.target.value as ReportInput["category"])}>{categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="report-field"><span>What happened?</span><textarea required minLength={10} maxLength={2000} rows={5} placeholder="Describe the issue with enough detail for our team to review it." value={description} onChange={(event) => setDescription(event.target.value)} /><small>{description.length}/2000</small></label><div className="report-optional-fields"><label className="report-field"><span>Room ID <small>(optional)</small></span><input maxLength={150} value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="Include if this relates to a room" /></label><label className="report-field"><span>Reported user ID <small>(optional)</small></span><input maxLength={128} value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="Only needed for user conduct reports" /></label></div>{error && <div className="auth-error" role="alert">{error}</div>}<div className="report-modal-footer"><span>Submitted privately as {user.email}</span><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : "Submit report"}</button></div></form>}</section></div>;
}
