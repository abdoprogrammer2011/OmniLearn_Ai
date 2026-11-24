import { ChevronRight, Command, Flag, LogOut, Moon, Search, Sun } from "lucide-react";
import type { User } from "firebase/auth";
import type { Page } from "../types";

const titles: Record<Page, string> = { home: "Overview", code: "CodeLingo", study: "EduNotes AI", rooms: "Study rooms", admin: "Reports Control Room" };

export default function Topbar({ page, darkMode, onSearch, onToggleTheme, user, onSignOut, onReport }: { page: Page; darkMode: boolean; onSearch: () => void; onToggleTheme: () => void; user: User; onSignOut: () => void; onReport: () => void }) {
  const initials = (user.displayName ?? user.email ?? "OL").split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{titles[page]}</strong></div>
      <div className="topbar-actions">
        <button className="search-trigger" onClick={onSearch}><Search size={16} /><span>Search anything...</span><kbd><Command size={11} /> K</kbd></button>
        <button className="icon-button theme-button" onClick={onToggleTheme} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button className="icon-button top-report-button" onClick={onReport} aria-label="Report an issue"><Flag size={16} /></button>
        <details className="account-menu"><summary aria-label="Account menu">{user.photoURL ? <img src={user.photoURL} alt="" /> : <span className="top-avatar">{initials}</span>}</summary><div className="account-menu-popover"><strong>{user.displayName ?? user.email}</strong><small>{user.email}</small><button onClick={onSignOut}><LogOut size={14} /> Sign out</button></div></details>
      </div>
    </header>
  );
}
