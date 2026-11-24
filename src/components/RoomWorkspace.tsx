import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, FileText, LoaderCircle, Paperclip, Plus, Send, ShieldCheck, Sparkles, Trash2, UsersRound, X } from "lucide-react";
import type { User } from "firebase/auth";
import type { ChatMessage } from "../types";
import { createRoom, joinRoom, saveRoomBoard, sendRoomMessage, subscribeRoomBoard, subscribeRoomDocuments, subscribeRoomMessages, subscribeRooms, type RoomBoard, type RoomDocumentItem, type RoomSummary } from "../services/firebaseData";
import { getRoomDocumentUrl, removeRoomDocument, uploadRoomDocument } from "../services/roomDocuments";
import MermaidDiagram from "./MermaidDiagram";
import RoomMeeting from "./RoomMeeting";
import RoomTutor from "./RoomTutor";

export default function RoomWorkspace({ user }: { user: User }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState(() => window.location.hash.startsWith("#room=") ? window.location.hash.slice(6) : "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documents, setDocuments] = useState<RoomDocumentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [boardDraft, setBoardDraft] = useState("");
  const [boardDiagram, setBoardDiagram] = useState("");
  const [boardSnapshot, setBoardSnapshot] = useState<RoomBoard>({ content: "", diagram: "", updatedBy: "", updatedAt: null });
  const [boardDirty, setBoardDirty] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [notice, setNotice] = useState("");
  const [roomError, setRoomError] = useState("");
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const boardDirtyRef = useRef(false);
  const boardSavingRef = useRef(false);
  const joiningRoomsRef = useRef(new Set<string>());
  const boardDraftRef = useRef(boardDraft);
  const boardDiagramRef = useRef(boardDiagram);
  boardDraftRef.current = boardDraft;
  boardDiagramRef.current = boardDiagram;
  const room = rooms.find((item) => item.id === roomId);
  const isRoomMember = Boolean(room?.memberIds.includes(user.uid));
  const participants = useMemo(() => room ? room.memberIds.map((id, index) => ({
    id,
    name: room.memberNames[id] ?? "Room member",
    initials: (room.memberNames[id] ?? "RM").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    color: ["avatar-lilac", "avatar-peach", "avatar-green"][index % 3],
    role: id === room.createdBy ? "Host" : "Member",
  })) : [], [room]);

  useEffect(() => subscribeRooms(setRooms, (error) => setRoomError(error.message)), []);

  useEffect(() => {
    if (!rooms.length) return;
    if (!rooms.some((item) => item.id === roomId)) setRoomId(rooms[0].id);
  }, [rooms, roomId]);

  useEffect(() => {
    if (!room) return;
    window.location.hash = `room=${room.id}`;
    if (room.memberIds.includes(user.uid)) {
      joiningRoomsRef.current.delete(room.id);
      return;
    }
    if (joiningRoomsRef.current.has(room.id)) return;
    joiningRoomsRef.current.add(room.id);
    void joinRoom(user, room.id).catch((error: Error) => {
      joiningRoomsRef.current.delete(room.id);
      setRoomError(`Couldn't join this room: ${error.message}`);
    });
  }, [room, user]);

  useEffect(() => {
    setMessages([]);
    if (!roomId || !isRoomMember) return;
    return subscribeRoomMessages(roomId, (items) => setMessages(items.map((item) => ({
      id: item.id,
      name: item.authorName,
      text: item.text,
      isAI: item.isAI,
      authorId: item.authorId,
      createdAt: item.createdAt ?? undefined,
      time: item.createdAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? "Now",
    }))), (error) => setRoomError(error.message));
  }, [roomId, isRoomMember]);

  useEffect(() => {
    setDocuments([]);
    if (!roomId || !isRoomMember) return;
    return subscribeRoomDocuments(roomId, setDocuments, (error) => setRoomError(error.message));
  }, [roomId, isRoomMember]);

  useEffect(() => {
    boardDirtyRef.current = false;
    setBoardDraft("");
    setBoardDiagram("");
    setBoardDirty(false);
    setBoardSnapshot({ content: "", diagram: "", updatedBy: "", updatedAt: null });
    if (!roomId || !isRoomMember) return;
    return subscribeRoomBoard(roomId, (snapshot) => {
      setBoardSnapshot(snapshot);
      if (!boardDirtyRef.current) {
        setBoardDraft(snapshot.content);
        setBoardDiagram(snapshot.diagram);
      }
    }, (error) => setRoomError(error.message));
  }, [roomId, isRoomMember]);

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

  async function handleDocumentUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !room || documentBusy) return;
    setDocumentBusy(true);
    setRoomError("");
    try {
      const result = await uploadRoomDocument(user, room.id, file);
      setNotice(result.textAvailable
        ? `${file.name} shared; its text is ready for the AI tutor`
        : `${file.name} shared. The AI tutor may not be able to read its text${result.extractionWarning ? `: ${result.extractionWarning}` : "."}`);
      window.setTimeout(() => setNotice(""), 2400);
    } catch (error) {
      setRoomError(error instanceof Error ? `Document upload failed: ${error.message}` : "Document upload failed.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function openDocument(document: RoomDocumentItem) {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await getRoomDocumentUrl(user, roomId, document.id);
      if (tab) tab.location.replace(url);
      else setNotice("Your browser blocked the document tab. Allow popups and try again.");
    } catch (error) {
      tab?.close();
      setRoomError(error instanceof Error ? `Could not open document: ${error.message}` : "Could not open document.");
    }
  }

  async function deleteDocument(document: RoomDocumentItem) {
    if (!room || !window.confirm(`Remove "${document.name}" from this study room?`)) return;
    setRoomError("");
    try {
      await removeRoomDocument(user, room.id, document);
      setNotice("Document removed from the room");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (error) {
      setRoomError(error instanceof Error ? `Could not remove document: ${error.message}` : "Could not remove document.");
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
    if (!room || !boardDirtyRef.current || boardSavingRef.current) return;
    const content = boardDraftRef.current;
    const diagram = boardDiagramRef.current;
    boardSavingRef.current = true;
    setBoardBusy(true);
    setRoomError("");
    try {
      await saveRoomBoard(user, room.id, content, diagram);
      setBoardSnapshot({ content, diagram, updatedBy: user.uid, updatedAt: new Date() });
      if (boardDraftRef.current === content && boardDiagramRef.current === diagram) {
        boardDirtyRef.current = false;
        setBoardDirty(false);
        setNotice("Whiteboard synced with the room");
        window.setTimeout(() => setNotice(""), 2400);
      } else {
        window.setTimeout(() => void saveSharedNotes(), 250);
      }
    } catch (error) {
      setRoomError(error instanceof Error ? `Whiteboard sync failed: ${error.message}` : "Whiteboard sync failed.");
    } finally {
      boardSavingRef.current = false;
      setBoardBusy(false);
    }
  }

  useEffect(() => {
    if (!room || !boardDirty) return;
    const timer = window.setTimeout(() => void saveSharedNotes(), 850);
    return () => window.clearTimeout(timer);
  }, [boardDirty, boardDiagram, boardDraft, room?.id]);

  async function shareTutorDiagram(diagram: string) {
    if (!room) return;
    boardDiagramRef.current = diagram;
    setBoardDiagram(diagram);
    boardDirtyRef.current = true;
    setBoardDirty(true);
    while (boardSavingRef.current) await new Promise((resolve) => window.setTimeout(resolve, 50));
    boardSavingRef.current = true;
    setBoardBusy(true);
    try {
      const content = boardDraftRef.current;
      await saveRoomBoard(user, room.id, content, diagram);
      setBoardSnapshot({ content, diagram, updatedBy: user.uid, updatedAt: new Date() });
      boardDirtyRef.current = false;
      setBoardDirty(false);
    } finally {
      boardSavingRef.current = false;
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
    if (!room || (!boardDraft.trim() && !boardDiagram)) return;
    const diagram = boardDiagram ? `\n\n## Lesson map\n\n\`\`\`mermaid\n${boardDiagram}\n\`\`\`\n` : "";
    const content = `# ${room.name}\n\n${boardDraft}${diagram}\n`;
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
      {!room ? <section className="room-empty-state"><span><UsersRound size={23} /></span><h2>Your first study room starts here.</h2><p>Create a room, invite classmates, and work through ideas together. Messages are shared live with signed-in room members.</p><button className="primary-button" onClick={() => setCreating(true)}><Plus size={15} /> Create a study room</button></section> : !isRoomMember ? <section className="room-empty-state" role="status"><LoaderCircle className="spin" size={23} /><h2>Joining {room.name}…</h2><p>Room tools will load after your access is confirmed.</p></section> : <div className="room-workspace">
        <section className="room-main">
          <div className="room-titlebar"><div className="room-title"><div className="room-title-icon"><Sparkles size={16} /></div><div><h2>{room.name}</h2><span>{participants.length} {participants.length === 1 ? "member has" : "members have"} access to this room</span></div></div></div>
          <RoomMeeting room={room} user={user} onInvite={() => void shareRoom()} onNotice={setNotice} />
          <div className="canvas-heading"><div><span className="canvas-label"><FileText size={13} /> LIVE SHARED WHITEBOARD</span><h3>Build the lesson together</h3></div><span className="board-sync-state">{boardBusy ? "Syncing…" : boardSnapshot.updatedAt ? `Synced ${boardSnapshot.updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Start writing to sync"}</span></div>
          <div className="shared-board">
            <textarea aria-label="Live shared whiteboard notes" disabled={boardBusy} maxLength={10000} value={boardDraft} onChange={(event) => { boardDirtyRef.current = true; setBoardDirty(true); setBoardDraft(event.target.value); }} placeholder="Write notes, questions, examples, or a plan. Changes sync to room members automatically." />
            {boardDiagram && <div className="shared-board-diagram"><div><strong>AI lesson map</strong><span>Generated by the room tutor and shared with everyone</span></div><MermaidDiagram chart={boardDiagram} /></div>}
            <div className="shared-board-footer"><span>{boardDirty ? "Changes syncing live…" : boardSnapshot.updatedBy === user.uid ? "Last edit by you" : boardSnapshot.updatedAt ? "Shared with this room" : "Edits sync to room members automatically"}</span><div><button className="board-export-button" disabled={!boardDraft.trim() && !boardDiagram} onClick={downloadCanvas}><ArrowDown size={14} /> Export notes</button><button className="primary-button board-save-button" disabled={!boardDirty || boardBusy} onClick={() => void saveSharedNotes()}>{boardBusy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} {boardBusy ? "Syncing…" : "Sync now"}</button></div></div>
          </div>
          <section className="room-documents">
            <div className="room-panel-heading"><div><span><FileText size={14} /></span><div><h3>Shared documents</h3><p>Authenticated Cloudinary files · signed links can be forwarded</p></div></div><button className="primary-button small-primary" disabled={documentBusy} onClick={() => documentInput.current?.click()}>{documentBusy ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} {documentBusy ? "Uploading…" : "Share a file"}</button></div>
            <input ref={documentInput} className="sr-only" type="file" accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md" onChange={(event) => void handleDocumentUpload(event)} aria-label="Choose a document to share" />
            {!documents.length ? <p className="room-documents-empty">Share a PDF or class document for everyone in this room.</p> : <ul>{documents.map((document) => <li key={document.id}><button className="room-document-open" onClick={() => void openDocument(document)}><FileText size={16} /><span><strong>{document.name}</strong><small>{formatFileSize(document.bytes)} · {document.createdAt?.toLocaleDateString() ?? "Just now"}</small></span></button>{(document.ownerUid === user.uid || room.createdBy === user.uid) && <button className="room-document-delete" aria-label={`Remove ${document.name}`} onClick={() => void deleteDocument(document)}><Trash2 size={15} /></button>}</li>)}</ul>}
          </section>
          <RoomTutor roomId={room.id} roomName={room.name} user={user} boardNotes={boardDraft} messages={messages} sharedDocuments={documents.map(({ name, textContent }) => ({ name, textContent }))} onDiagram={shareTutorDiagram} onNotice={setNotice} />
        </section>
        <aside className="room-chat">
          <div className="chat-header"><div><h3>Room chat</h3><span><i className="room-live-indicator" /> {participants.length} members</span></div><button onClick={() => setShowMembers(!showMembers)} aria-label="Toggle participants"><UsersRound size={16} /></button></div>
          {showMembers && <div className="participant-list">{participants.map((person) => <div className="participant" key={person.id}><div className={`person-avatar ${person.color}`}>{person.initials}<i /></div><span><strong>{person.name}{person.id === user.uid ? " (you)" : ""}</strong><small>{person.role}</small></span>{person.role === "Host" && <span className="host-tag">HOST</span>}</div>)}</div>}
          <div className="chat-divider"><span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
          <div className="messages-list">{chatMessages.map((message) => <div className={`chat-message ${message.isAI ? "ai-chat-message" : ""}`} key={message.id}><div className={`message-avatar ${message.isAI ? "ai-message-avatar" : message.name === user.displayName ? "you-message-avatar" : "other-message-avatar"}`}>{message.isAI ? <Sparkles size={13} /> : message.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="message-content"><div className="message-meta"><strong>{message.name}</strong><time>{message.time}</time></div><p>{message.text}</p></div></div>)}{!chatMessages.length && <p className="room-no-messages">Say hello or share a question to get the discussion going.</p>}<div ref={endRef} /></div>
          <div className="chat-quick-prompts"><button onClick={() => setDraft("Can you explain the time complexity?")}>Explain complexity</button><button onClick={() => setDraft("Let's try an edge case.")}>Try an edge case</button></div>
          <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}><input maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message your room..." aria-label="Chat message" /><div><button type="button" aria-label="Share a note in chat" onClick={() => setNotice("Paste the text you want to share directly into the message field.")}><Paperclip size={15} /></button><button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim()}><Send size={15} /></button></div></form>
          <div className="chat-disclaimer"><ShieldCheck size={11} /> Room messages are visible to members with access</div>
        </aside>
      </div>}
      {notice && <div className="room-toast"><Check size={14} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={13} /></button></div>}
    </div>
  );
}

function formatFileSize(bytes: number) {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
