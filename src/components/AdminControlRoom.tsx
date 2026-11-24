import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, Ban, Check, Clock3, DoorClosed, LoaderCircle, RefreshCw, Search, ShieldAlert, ShieldCheck, UsersRound, UserRoundCheck, UserX } from "lucide-react";
import { getAdminStats, moderateReport, setUserBanned, subscribeReports, subscribeUsers, type ReportItem, type UserSummary } from "../services/firebaseData";
import { auth } from "../firebase";

type Filter = "all" | "open" | "processing" | "resolved" | "bug" | "abuse" | "content";

export default function AdminControlRoom() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [stats, setStats] = useState({ users: 0, rooms: 0, reports: 0, events: 0 });
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [error, setError] = useState("");
  const [loadingStats, setLoadingStats] = useState(false);
  const visibleReports = useMemo(() => reports.filter((report) => filter === "all" || report.status === filter || report.category === filter), [reports, filter]);
  const visibleUsers = useMemo(() => users.filter((item) => `${item.displayName} ${item.email} ${item.uid}`.toLowerCase().includes(userSearch.toLowerCase())), [users, userSearch]);

  async function refreshStats() {
    setLoadingStats(true);
    setError("");
    try {
      setStats(await getAdminStats());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load platform analytics.");
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeReports(setReports, (caught) => setError(caught.message));
    const unsubscribeUsers = subscribeUsers(setUsers, (caught) => setError(caught.message));
    void refreshStats();
    return () => { unsubscribe(); unsubscribeUsers(); };
  }, []);

  async function act(report: ReportItem, action: "resolve" | "close-room" | "ban-user") {
    const descriptions = {
      resolve: "Mark this report as resolved?",
      "close-room": `Close the reported room "${report.roomId ?? ""}"? Its messages will be preserved.`,
      "ban-user": `Suspend this account? The account will lose access to the workspace. User ID: ${report.targetUserId ?? ""}`,
    };
    if (!window.confirm(descriptions[action])) return;
    setBusyId(report.id);
    setError("");
    try {
      await moderateReport(report, action);
      await refreshStats();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The moderation action failed.");
    } finally {
      setBusyId("");
    }
  }

  async function toggleUserBan(item: UserSummary) {
    if (item.uid === auth?.currentUser?.uid || item.isAdmin) return;
    const nextBannedState = !item.isBanned;
    const action = nextBannedState ? "Suspend" : "Restore";
    if (!window.confirm(`${action} access for ${item.email || item.displayName}?`)) return;
    setBusyUserId(item.uid);
    setError("");
    try {
      await setUserBanned(item.uid, nextBannedState);
      await refreshStats();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The account status could not be updated.");
    } finally {
      setBusyUserId("");
    }
  }

  return <div className="page-content admin-page">
    <div className="module-heading admin-heading"><div><div className="module-breadcrumb"><span className="module-icon admin-module-icon"><ShieldCheck size={16} /></span> TRUST & SAFETY</div><h1>Reports Control Room</h1><p>Review incoming reports and take accountable moderation actions.</p></div><button className="quiet-button" onClick={() => void refreshStats()} disabled={loadingStats}>{loadingStats ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Refresh analytics</button></div>
    {error && <div className="admin-error" role="alert"><AlertTriangle size={15} />{error}</div>}
    <div className="admin-security-note"><ShieldCheck size={15} /><span><strong>Admin access is controlled by protected Firestore profile fields.</strong> Moderation is rules-guarded; closing a room preserves its messages.</span></div>
    <section className="admin-stats">
      <AdminStat icon={<UsersRound size={17} />} label="Registered accounts" value={stats.users} color="blue" />
      <AdminStat icon={<Activity size={17} />} label="Active study rooms" value={stats.rooms} color="green" />
      <AdminStat icon={<AlertTriangle size={17} />} label="Open reports" value={stats.reports} color="orange" />
      <AdminStat icon={<Clock3 size={17} />} label="Logged activities" value={stats.events} color="violet" />
    </section>
    <section className="reports-panel user-management-panel">
      <div className="reports-heading"><div><p className="section-kicker">ACCOUNT ACCESS</p><h2>Users <span>{users.length}</span></h2></div><label className="admin-user-search"><span className="sr-only">Search users</span><Search size={14} /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, email, or ID" /></label></div>
      {!visibleUsers.length ? <div className="reports-empty"><strong>{users.length ? "No users match this search." : "No user profiles found."}</strong></div> : <div className="admin-users-list">{visibleUsers.map((item) => <article className="admin-user-row" key={item.uid}><span className={`admin-user-icon ${item.isBanned ? "banned" : ""}`}>{item.isBanned ? <Ban size={16} /> : <UserRoundCheck size={16} />}</span><div className="admin-user-copy"><strong>{item.displayName}{item.isAdmin && <span className="admin-role-badge">ADMIN</span>}</strong><small>{item.email || item.uid}</small></div><span className={`account-status ${item.isBanned ? "banned" : "active"}`}>{item.isBanned ? "Suspended" : "Active"}</span><button className={`account-action ${item.isBanned ? "restore" : "suspend"}`} disabled={busyUserId === item.uid || item.isAdmin || item.uid === auth?.currentUser?.uid} onClick={() => void toggleUserBan(item)}>{busyUserId === item.uid ? <LoaderCircle size={13} className="spin" /> : item.isBanned ? <UserRoundCheck size={13} /> : <UserX size={13} />}{item.isBanned ? "Restore" : "Suspend"}</button></article>)}</div>}
    </section>
    <section className="reports-panel">
      <div className="reports-heading"><div><p className="section-kicker">MODERATION QUEUE</p><h2>Incoming reports <span>{reports.filter((item) => item.status === "open").length}</span></h2></div><label className="report-filter"><span>Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="open">Open reports</option><option value="processing">Processing</option><option value="all">All reports</option><option value="resolved">Resolved</option><option value="bug">Bugs</option><option value="abuse">Abuse</option><option value="content">Content</option></select></label></div>
      {!visibleReports.length ? <div className="reports-empty"><span><Check size={20} /></span><strong>{reports.length ? "No reports match this filter." : "The queue is clear."}</strong><p>New reports from users appear here in real time.</p></div> : <div className="reports-list">{visibleReports.map((report) => <article className="report-card" key={report.id}><div className={`report-category-icon ${report.category}`}><ReportCategoryIcon category={report.category} /></div><div className="report-card-body"><div className="report-card-heading"><strong>{report.category === "bug" ? "Bug report" : report.category === "abuse" ? "Abuse report" : "Content report"}</strong><span className={`report-status ${report.status}`}>{report.status}</span><time>{report.createdAt?.toLocaleString() ?? "Just submitted"}</time></div><p>{report.description}</p><div className="report-meta"><span>Reporter: {report.reporterEmail || report.reporterUid}</span>{report.roomId && <span>Room: <code>{report.roomId}</code></span>}{report.targetUserId && <span>User: <code>{report.targetUserId}</code></span>}{report.moderatedBy && <span>Moderator: <code>{report.moderatedBy}</code></span>}</div>{report.status === "open" && <ReportActions report={report} busy={busyId === report.id} onAction={act} />}{report.status === "processing" && report.moderatedBy === auth?.currentUser?.uid && report.moderationAction && <div className="report-actions"><button disabled={busyId === report.id} onClick={() => void act(report, report.moderationAction!)}><RefreshCw size={13} /> Retry {report.moderationAction}</button>{busyId === report.id && <LoaderCircle size={14} className="spin report-action-spinner" />}</div>}</div></article>)}</div>}
    </section>
  </div>;
}

function AdminStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return <article className="admin-stat-card"><span className={`admin-stat-icon ${color}`}>{icon}</span><strong>{value.toLocaleString()}</strong><small>{label}</small><ArrowUpRight size={14} /></article>;
}

function ReportActions({ report, busy, onAction }: { report: ReportItem; busy: boolean; onAction: (report: ReportItem, action: "resolve" | "close-room" | "ban-user") => Promise<void> }) {
  return <div className="report-actions"><button disabled={busy} onClick={() => void onAction(report, "resolve")}><Check size={13} /> Resolve</button><button disabled={!report.roomId || busy} onClick={() => void onAction(report, "close-room")}><DoorClosed size={13} /> Close room</button><button className="danger" disabled={!report.targetUserId || busy || report.targetUserId === report.reporterUid} onClick={() => void onAction(report, "ban-user")}><UserX size={13} /> Suspend user</button>{busy && <LoaderCircle size={14} className="spin report-action-spinner" />}</div>;
}

function ReportCategoryIcon({ category }: { category: ReportItem["category"] }) {
  if (category === "bug") return <AlertTriangle size={16} />;
  if (category === "abuse") return <ShieldAlert size={16} />;
  return <Activity size={16} />;
}
