import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, FileText, LoaderCircle, Paperclip, Plus, Send, Share2, ShieldCheck, Sparkles, UsersRound, X } from "lucide-react";
import type { User } from "firebase/auth";
import type { ChatMessage } from "../types";
import { createRoom, joinRoom, saveRoomBoard, sendRoomMessage, subscribeRoomBoard, subscribeRoomMessages, subscribeRooms, type RoomBoard, type RoomSummary } from "../services/firebaseData";

export default function RoomWorkspace({ user }: { user: User }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState(() => window.location.hash.startsWith("#room=") ? window.location.hash.slice(6) : "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [boardDraft, setBoardDraft] = useState("");
  const [boardSnapshot, setBoardSnapshot] = useState<RoomBoard>({ content: "", updatedBy: "", updatedAt: null });
  const [boardDirty, setBoardDirty] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [notice, setNotice] = useState("");
  const [roomError, setRoomError] = useState("");
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boardDirtyRef = useRef(false);
  const room = rooms.find((item) => item.id === roomId);
  const participants = useMemo(() => room ? room.memberIds.map((id, index) => ({
    id,
    name: room.memberNames[id] ?? "Room member",
    initials: (room.memberNames[id] ?? "RM").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    color: ["avatar-lilac", "avatar-peach", "avatar-green"][index % 3],
    role: id === room.createdBy ? "Host" : "Member",
  })) : [], [room]);

  useEffect(() => subscribeRooms(setRooms, (error) => setRoomError(error.message)), []);

  useEffect(() => {
    if (!rooms.length) {
      setRoomId("");
      return;
    }
    if (!rooms.some((item) => item.id === roomId)) setRoomId(rooms[0].id);
  }, [rooms, roomId]);

  useEffect(() => {
    if (!room) return;
    window.location.hash = `room=${room.id}`;
    if (room.memberIds.includes(user.uid)) return;
    void joinRoom(user, room.id).catch((error: Error) => setRoomError(`Couldn't join this room: ${error.message}`));
  }, [room, user]);

  useEffect(() => {
    setMessages([]);
    if (!roomId) return;
    return subscribeRoomMessages(roomId, (items) => setMessages(items.map((item) => ({
      id: item.id,
      name: item.authorName,
      text: item.text,
      createdAt: item.createdAt ?? undefined,
      time: item.createdAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? "Now",
    }))), (error) => setRoomError(error.message));
  }, [roomId]);

  useEffect(() => {
    boardDirtyRef.current = false;
    setBoardDraft("");
    setBoardDirty(false);
    setBoardSnapshot({ content: "", updatedBy: "", updatedAt: null });
    if (!roomId) return;
    return subscribeRoomBoard(roomId, (snapshot) => {
      setBoardSnapshot(snapshot);
      if (!boardDirtyRef.current) setBoardDraft(snapshot.content);
    }, (error) => setRoomError(error.message));
  }, [roomId]);

  const chatMessages = messages;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages.length]);

  async function submitRoom(event: FormEvent) {
    event.preventDefault();
    if (!roomName.trim() || busy) return;
    setBusy(true);
    setRoomError("");
    try {
      const id = await createRoom(user, roomName);
      setRoomId(id);
      setRoomName("");
      setCreating(false);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Could not create the room.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !roomId || !room) return;
    setRoomError("");
    try {
      await sendRoomMessage(user, roomId, text);
      setDraft("");
    } catch (error) {
      setRoomError(error instanceof Error ? `Message not sent: ${error.message}` : "Message not sent.");
    }
  }

  async function saveSharedNotes() {
    if (!room || !boardDirty || boardBusy) return;
    setBoardBusy(true);
    setRoomError("");
    try {
      await saveRoomBoard(user, room.id, boardDraft);
      boardDirtyRef.current = false;
      setBoardDirty(false);
      setBoardSnapshot({ content: boardDraft, updatedBy: user.uid, updatedAt: new Date() });
      setNotice("Shared room notes saved");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (error) {
      setRoomError(error instanceof Error ? `Notes were not saved: ${error.message}` : "Notes were not saved.");
    } finally {
      setBoardBusy(false);
    }
  }

  async function shareRoom() {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Room link copied to clipboard");
    } catch {
      setNotice("Clipboard access is unavailable in this browser.");
    }
    window.setTimeout(() => setNotice(""), 2400);
  }

  function downloadCanvas() {
    if (!room || !boardDraft.trim()) return;
    const content = `# ${room.name}\n\n${boardDraft}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${room.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "study-room"}-notes.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="page-content module-page room-page">
      <div className="module-heading room-heading"><div><div className="module-breadcrumb"><span className="module-icon room-module-icon"><UsersRound size={16} /></span> COLLABORATION HUB</div><h1>Better together.</h1><p>Think out loud, work through it, learn from each other.</p></div><span className="quiet-button room-live-label"><i className="room-live-indicator" /> Messages sync live</span></div>
      <div className="room-management-bar"><label><span>YOUR LIVE ROOMS</span><select aria-label="Choose a study room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="primary-button small-primary" onClick={() => { setCreating(!creating); setRoomError(""); }}><Plus size={14} /> Create room</button></div>
      {creating && <form className="room-create-form" onSubmit={(event) => void submitRoom(event)}><label>Give your study room a name<input autoFocus minLength={3} maxLength={80} required value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="e.g. Data structures study group" /></label><button className="primary-button small-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : "Create room"}</button><button type="button" className="icon-button" aria-label="Cancel room creation" onClick={() => setCreating(false)}><X size={15} /></button></form>}
      {roomError && <p className="inline-error room-error" role="alert">{roomError}</p>}
      {!room ? <section className="room-empty-state"><span><UsersRound size={23} /></span><h2>Your first study room starts here.</h2><p>Create a room, invite classmates, and work through ideas together. Messages are shared live with signed-in room members.</p><button className="primary-button" onClick={() => setCreating(true)}><Plus size={15} /> Create a study room</button></section> : <div className="room-workspace">
        <section className="room-main">
          <div className="room-titlebar"><div className="room-title"><div className="room-title-icon"><Sparkles size={16} /></div><div><h2>{room.name}</h2><span>{participants.length} {participants.length === 1 ? "member has" : "members have"} access to this room</span></div></div><div className="room-controls"><button className="quiet-button invite-button" onClick={() => void shareRoom()}><Share2 size={14} /> Invite</button></div></div>
          <div className="canvas-heading"><div><span className="canvas-label"><FileText size={13} /> SHARED ROOM NOTES</span><h3>Work through the topic together</h3></div><span className="board-sync-state">{boardSnapshot.updatedAt ? `Updated ${boardSnapshot.updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No saved notes yet"}</span></div>
          <div className="shared-board">
            <textarea aria-label="Shared room notes" disabled={boardBusy} maxLength={10000} value={boardDraft} onChange={(event) => { boardDirtyRef.current = true; setBoardDirty(true); setBoardDraft(event.target.value); }} placeholder="Write notes, questions, examples, or a plan for your study session. Save to share them with everyone in this room." />
            <div className="shared-board-footer"><span>{boardDirty ? "Unsaved changes" : boardSnapshot.updatedBy === user.uid ? "Saved by you" : boardSnapshot.updatedAt ? "Saved to this room" : "Notes are shared only after you save"}</span><div><button className="board-export-button" disabled={!boardDraft.trim()} onClick={downloadCanvas}><ArrowDown size={14} /> Export notes</button><button className="primary-button board-save-button" disabled={!boardDirty || boardBusy} onClick={() => void saveSharedNotes()}>{boardBusy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} {boardBusy ? "Saving…" : "Save shared notes"}</button></div></div>
          </div>
        </section>
        <aside className="room-chat">
          <div className="chat-header"><div><h3>Room chat</h3><span><i className="room-live-indicator" /> {participants.length} members</span></div><button onClick={() => setShowMembers(!showMembers)} aria-label="Toggle participants"><UsersRound size={16} /></button></div>
          {showMembers && <div className="participant-list">{participants.map((person) => <div className="participant" key={person.id}><div className={`person-avatar ${person.color}`}>{person.initials}<i /></div><span><strong>{person.name}{person.id === user.uid ? " (you)" : ""}</strong><small>{person.role}</small></span>{person.role === "Host" && <span className="host-tag">HOST</span>}</div>)}</div>}
          <div className="chat-divider"><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
          <div className="messages-list">{chatMessages.map((message) => <div className="chat-message" key={message.id}><div className={`message-avatar ${message.name === user.displayName ? "you-message-avatar" : "other-message-avatar"}`}>{message.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="message-content"><div className="message-meta"><strong>{message.name}</strong><time>{message.time}</time></div><p>{message.text}</p></div></div>)}{!chatMessages.length && <p className="room-no-messages">Say hello or share a question to get the discussion going.</p>}<div ref={endRef} /></div>
          <div className="chat-quick-prompts"><button onClick={() => setDraft("Can you explain the time complexity?")}>Explain complexity</button><button onClick={() => setDraft("Let's try an edge case.")}>Try an edge case</button></div>
          <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}><input maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message your room..." aria-label="Chat message" /><div><button type="button" aria-label="Share a note in chat" onClick={() => setNotice("Paste the text you want to share directly into the message field.")}><Paperclip size={15} /></button><button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim()}><Send size={15} /></button></div></form>
          <div className="chat-disclaimer"><ShieldCheck size={11} /> Room messages are visible to members with access</div>
        </aside>
      </div>}
      {notice && <div className="room-toast"><Check size={14} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={13} /></button></div>}
    </div>
  );
}
