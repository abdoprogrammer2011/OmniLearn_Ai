import { BookOpenCheck, Braces, ChevronDown, Flag, House, LogOut, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { User } from "firebase/auth";
import type { Page } from "../types";

interface SidebarProps {
  active: Page;
  onNavigate: (page: Page) => void;
  user: User;
  isAdmin: boolean;
  onSignOut: () => void;
  onReport: () => void;
}

export default function Sidebar({ active, onNavigate, user, isAdmin, onSignOut, onReport }: SidebarProps) {
  const links = [
    { id: "home" as Page, label: "Overview", icon: House },
    { id: "code" as Page, label: "CodeLingo", icon: Braces },
    { id: "study" as Page, label: "EduNotes AI", icon: BookOpenCheck },
    { id: "rooms" as Page, label: "Study rooms", icon: UsersRound },
    ...(isAdmin ? [{ id: "admin" as Page, label: "Reports control", icon: ShieldCheck }] : []),
  ];
  const initials = (user.displayName ?? user.email ?? "OL").split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate("home")} aria-label="Go to overview">
        <span className="brand-mark"><Sparkles size={19} strokeWidth={2.3} /></span>
        <span className="brand-name">omni<span>learn</span></span>
        <span className="brand-ai">AI</span>
      </button>
      <div className="workspace-picker">
        <div className="workspace-avatar">{initials.slice(0, 1)}</div>
        <div className="workspace-copy"><strong>{user.displayName ? `${user.displayName}'s workspace` : "Your workspace"}</strong><small>{isAdmin ? "Administrator" : "Personal plan"}</small></div>
        <ChevronDown size={15} className="muted-icon" />
      </div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="nav-list" aria-label="Main navigation">
        {links.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${active === id ? "active" : ""}`} onClick={() => onNavigate(id)}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            {id === "rooms" && <span className="live-dot" aria-label="Live" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-workspace-note"><span><ShieldCheck size={16} /></span><div><strong>Private workspace</strong><small>Your account is protected</small></div></div>
      <div className="sidebar-spacer" />
      <div className="sidebar-account-actions"><button onClick={onReport}><Flag size={14} /> Report an issue</button></div>
      <div className="plan-card workspace-sync-card">
        <div className="plan-icon"><Sparkles size={15} /></div>
        <strong>Keep your momentum</strong>
        <p>Your study and code workspaces are ready whenever you are.</p>
      </div>
      <button className="profile-row" onClick={onSignOut} title="Sign out">
        {user.photoURL ? <img className="profile-avatar profile-photo" src={user.photoURL} alt="" /> : <div className="profile-avatar">{initials}</div>}
        <div className="profile-copy"><strong>{user.displayName ?? user.email}</strong><small>{isAdmin ? "Administrator account" : "Personal account"}</small></div>
        <LogOut size={15} className="muted-icon" />
      </button>
    </aside>
  );
}
