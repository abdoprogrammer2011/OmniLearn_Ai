import { Suspense, lazy, useEffect, useState } from "react";
import { ArrowRight, Braces, LoaderCircle, Search, ShieldAlert, X } from "lucide-react";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import AuthGate from "./components/AuthGate";
import LandingPage from "./components/LandingPage";
import ReportIssueModal from "./components/ReportIssueModal";
import { auth, firebaseReady } from "./firebase";
import { ensureUserProfile, getUserAccess, subscribeUserAccess } from "./services/firebaseProfile";
import type { Page } from "./types";

const Dashboard = lazy(() => import("./components/Dashboard"));
const CodeWorkspace = lazy(() => import("./components/CodeWorkspace"));
const StudyWorkspace = lazy(() => import("./components/StudyWorkspace"));
const RoomWorkspace = lazy(() => import("./components/RoomWorkspace"));
const AdminControlRoom = lazy(() => import("./components/AdminControlRoom"));

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("omnilearn-theme") === "dark");
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(firebaseReady);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [authRequested, setAuthRequested] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onIdTokenChanged(auth, async (currentUser) => {
      setChecking(true);
      setUser(currentUser);
      setProfileReady(false);
      setProfileError("");
      setIsAdmin(false);
      setIsBanned(false);
      if (!currentUser) {
        setChecking(false);
        return;
      }
      try {
        if (currentUser.emailVerified) {
          await ensureUserProfile(currentUser);
          const access = await getUserAccess(currentUser.uid);
          if (auth?.currentUser?.uid !== currentUser.uid) return;
          setIsAdmin(access.isAdmin);
          setIsBanned(access.isBanned);
          setProfileReady(true);
        }
      } catch (error) {
        if (auth?.currentUser?.uid === currentUser.uid) setProfileError(profileSetupError(error));
      } finally {
        if (auth?.currentUser?.uid === currentUser.uid) setChecking(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user || !profileReady) return;
    return subscribeUserAccess(user.uid, (access) => {
      setIsAdmin(access.isAdmin);
      setIsBanned(access.isBanned);
    }, (error) => setProfileError(error.message));
  }, [user?.uid, profileReady]);

  useEffect(() => {
    localStorage.setItem("omnilearn-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && user && profileReady) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setReportOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, profileReady]);

  async function logout() {
    if (auth) await signOut(auth);
    setPage("home");
  }

  async function refreshProfile() {
    if (!user) return;
    setProfileError("");
    setChecking(true);
    try {
      await user.reload();
      await user.getIdToken(true);
      const refreshedUser = auth?.currentUser;
      if (refreshedUser?.emailVerified) {
        await ensureUserProfile(refreshedUser);
        const access = await getUserAccess(refreshedUser.uid);
        setIsAdmin(access.isAdmin);
        setIsBanned(access.isBanned);
        setProfileReady(true);
      } else {
        setProfileError("Your email is not verified yet. Open the verification link from your inbox and try again.");
      }
    } catch (error) {
      setProfileError(profileSetupError(error));
    } finally {
      setChecking(false);
    }
  }

  if (user && profileReady && isBanned) {
    return <div className="auth-shell"><section className="auth-card config-card banned-account-card"><div className="auth-icon auth-error-icon"><ShieldAlert size={21} /></div><p className="auth-eyebrow">ACCOUNT ACCESS</p><h1>This account is suspended</h1><p>Your account cannot access OmniLearn workspaces right now. Contact an administrator if you believe this is a mistake.</p><button className="auth-back" onClick={() => void logout()}>Sign out</button></section></div>;
  }

  if (!user || !profileReady) {
    if (!user && !authRequested) return <LandingPage onGetStarted={() => setAuthRequested(true)} />;
    if (profileError && user?.emailVerified) {
      return <div className="auth-shell"><section className="auth-card config-card"><div className="auth-icon auth-error-icon"><ShieldAlert size={21} /></div><h1>Couldn't open your workspace</h1><p>{profileError}</p><button className="auth-primary" onClick={() => void refreshProfile()}>Retry secure setup</button><button className="auth-back" onClick={() => void logout()}>Sign out</button></section></div>;
    }
    return <AuthGate checking={checking || Boolean(user?.emailVerified && !profileReady)} user={user} onSignOut={logout} onVerified={refreshProfile} onBackToLanding={() => setAuthRequested(false)} />;
  }

  return (
    <div className={`app-shell ${darkMode ? "dark-mode" : ""}`}>
      <Sidebar active={page} onNavigate={setPage} user={user} isAdmin={isAdmin} onSignOut={logout} onReport={() => setReportOpen(true)} />
      <div className="main-column">
        <Topbar page={page} darkMode={darkMode} onToggleTheme={() => setDarkMode(!darkMode)} onSearch={() => setSearchOpen(true)} user={user} onSignOut={logout} onReport={() => setReportOpen(true)} />
        <main className="main-content">
          <Suspense fallback={<div className="page-loading"><LoaderCircle className="spin" size={20} /> Loading your workspace…</div>}>
          {page === "home" && <Dashboard onNavigate={setPage} uid={user.uid} />}
          {page === "code" && <CodeWorkspace user={user} />}
          {page === "study" && <StudyWorkspace user={user} />}
          {page === "rooms" && <RoomWorkspace user={user} />}
          {page === "admin" && isAdmin && <AdminControlRoom />}
          {page === "admin" && !isAdmin && <AccessDenied onHome={() => setPage("home")} />}
          </Suspense>
        </main>
      </div>
      {searchOpen && <SearchDialog isAdmin={isAdmin} onClose={() => setSearchOpen(false)} onNavigate={(destination) => { setPage(destination); setSearchOpen(false); }} />}
      {reportOpen && <ReportIssueModal user={user} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

function profileSetupError(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "permission-denied") {
    return "Firestore denied access to your profile. Verify your email and deploy the latest firestore.rules to the Firebase project configured for this app.";
  }
  return error instanceof Error ? error.message : "Could not initialize your secure profile.";
}

function AccessDenied({ onHome }: { onHome: () => void }) {
  return <section className="access-denied"><span><ShieldAlert size={22} /></span><p className="section-kicker">RESTRICTED AREA</p><h1>Administrator access required</h1><p>This account does not have the trusted administrator role.</p><button className="primary-button" onClick={onHome}>Back to workspace <ArrowRight size={15} /></button></section>;
}

function SearchDialog({ isAdmin, onClose, onNavigate }: { isAdmin: boolean; onClose: () => void; onNavigate: (page: Page) => void }) {
  const [query, setQuery] = useState("");
  const items: { title: string; description: string; page: Page; icon: React.ReactNode }[] = [
    { title: "CodeLingo workspace", description: "Understand, debug, and translate code", page: "code", icon: <Braces size={17} /> },
    { title: "EduNotes AI", description: "Study from your documents", page: "study", icon: <Search size={17} /> },
    { title: "Study rooms", description: "Collaborate with your study group", page: "rooms", icon: <ArrowRight size={17} /> },
    ...(isAdmin ? [{ title: "Reports Control Room", description: "Review moderation reports and platform activity", page: "admin" as Page, icon: <ShieldAlert size={17} /> }] : []),
  ];
  const filtered = items.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="search-overlay" onMouseDown={onClose}><section className="search-modal" onMouseDown={(event) => event.stopPropagation()}><div className="search-modal-input"><Search size={18} /><input autoFocus placeholder="Where would you like to go?" value={query} onChange={(event) => setQuery(event.target.value)} /><button onClick={onClose} aria-label="Close search"><X size={16} /></button></div><p className="search-modal-label">{query ? "RESULTS" : "QUICK NAVIGATION"}</p>{filtered.length ? filtered.map((item) => <button className="search-result" key={item.page} onClick={() => onNavigate(item.page)}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><ArrowRight size={15} /></button>) : <div className="search-no-results">No results found. Try a different search.</div>}<div className="search-modal-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>ESC</kbd> to close</span></div></section></div>;
}
