import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Braces, FileText, Flame, Plus, ShieldCheck, Sparkles, Target, UsersRound, Zap } from "lucide-react";
import type { Page } from "../types";
import { getUserStats, subscribeActivity, type ActivityItem } from "../services/firebaseData";

interface DashboardProps { onNavigate: (page: Page) => void; uid: string }

export default function Dashboard({ onNavigate, uid }: DashboardProps) {
  const currentDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState({ analyses: 0, quizzes: 0 });
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    getUserStats(uid).then((result) => { if (active) setStats(result); }).catch((error: Error) => { if (active) setLoadError(error.message); });
    const unsubscribe = subscribeActivity(uid, setActivity, (error) => setLoadError(error.message));
    return () => { active = false; unsubscribe(); };
  }, [uid]);

  return (
    <div className="page-content dashboard-page">
      <section className="welcome-banner">
        <div className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-spark"><Sparkles size={13} /></span> {currentDate.toUpperCase()}</div>
          <h1>Your next big idea<br />starts <span>right here.</span></h1>
          <p>Make today a little more curious. Pick up where you left off, or explore something new.</p>
          <button className="primary-button welcome-button" onClick={() => onNavigate("code")}>Jump back in <ArrowRight size={16} /></button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-planet"><div className="planet-shine" /><Sparkles size={29} /></div>
          <div className="float-card float-card-code"><Braces size={17} /><span>Code, decoded.</span></div>
          <div className="float-card float-card-notes"><BookOpen size={16} /><span>Ideas, connected.</span></div>
          <span className="art-star star-one">✳</span><span className="art-star star-two">✦</span>
        </div>
        <div className="banner-index">01 <span>/ 03</span></div>
      </section>
      <div className="section-heading stats-heading"><div><p className="section-kicker">YOUR LEARNING, AT A GLANCE</p><h2>A little progress goes a long way</h2></div><span className="dashboard-period-label">ALL TIME</span></div>
      <section className="stats-grid">
        <StatCard icon={<FileText size={17} />} color="violet" value={String(activity.filter((item) => item.module === "study").length)} label="Recent study guides" change="Saved to your account" />
        <StatCard icon={<Braces size={17} />} color="blue" value={String(activity.filter((item) => item.module === "code").length)} label="Recent code sessions" change={`${stats.analyses} total analyses`} />
        <StatCard icon={<Target size={17} />} color="green" value={String(stats.quizzes)} label="Quizzes completed" change="Synced to your profile" />
        <StatCard icon={<Flame size={17} />} color="orange" value={`${stats.analyses + stats.quizzes}`} label="Learning activities" change="Across your workspaces" />
      </section>
      <section className="dashboard-lower">
        <div className="continue-panel">
          <div className="section-heading compact-heading"><div><p className="section-kicker">PICK UP WHERE YOU LEFT OFF</p><h2>Recent activity</h2></div><button className="icon-button mini-add" aria-label="Open code workspace" onClick={() => onNavigate("code")}><Plus size={16} /></button></div>
          {loadError && <p className="inline-error">{loadError}</p>}
          {activity.length ? activity.slice(0, 5).map((item) => <button className="activity-row" key={item.id} onClick={() => onNavigate(item.module)}><div className={`activity-icon ${item.module === "code" ? "activity-code" : "activity-notes"}`}>{item.module === "code" ? <Braces size={18} /> : <BookOpen size={17} />}</div><div className="activity-main"><strong>{item.title}</strong><small>{item.module === "code" ? `CodeLingo · ${item.language ?? "Code"}` : "EduNotes AI"} · {item.createdAt ? item.createdAt.toLocaleString() : "Just now"}</small></div><span className="activity-tag">{item.action}</span><ArrowRight size={16} className="activity-arrow" /></button>) : !loadError && <div className="activity-empty">Your workspace history will appear here as you explore.</div>}
        </div>
        <div className="quick-panel">
          <div className="section-heading compact-heading"><div><p className="section-kicker">MAKE SOMETHING</p><h2>Quick start</h2></div></div>
          <button className="quick-action quick-code" onClick={() => onNavigate("code")}><div className="quick-action-icon"><Braces size={18} /></div><div><strong>Understand some code</strong><small>Explain, debug, or translate</small></div><ArrowUpRight size={16} /></button>
          <button className="quick-action quick-study" onClick={() => onNavigate("study")}><div className="quick-action-icon"><FileText size={17} /></div><div><strong>Study from your notes</strong><small>Turn docs into active recall</small></div><ArrowUpRight size={16} /></button>
          <button className="quick-action quick-room" onClick={() => onNavigate("rooms")}><div className="quick-action-icon"><UsersRound size={17} /></div><div><strong>Learn together</strong><small>Start or join a study room</small></div><ArrowUpRight size={16} /></button>
        </div>
      </section>
      <div className="dashboard-footer"><span><Zap size={13} /> Small steps add up. You're doing great.</span><span className="dashboard-save-note"><ShieldCheckIcon /> Your activity is private to your account</span></div>
    </div>
  );
}

function ShieldCheckIcon() { return <ShieldCheck size={13} aria-hidden="true" />; }

function StatCard({ icon, color, value, label, change, up = false }: { icon: React.ReactNode; color: string; value: string; label: string; change: string; up?: boolean }) {
  return <article className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div className="stat-change">{up && <ArrowUpRight size={13} />}{change}</div><strong className="stat-value">{value}</strong><span className="stat-label">{label}</span></article>;
}
