import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, firebaseApp } from "../firebase";

function requireDb() {
  if (!firebaseApp) throw new Error("Firebase is not configured. Add your VITE_FIREBASE_* values to .env.local.");
  return getFirestore(firebaseApp);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("The Firebase request failed. Please try again.");
}

export interface ActivityInput {
  action: string;
  module: "code" | "study";
  title: string;
  language?: string;
  characterCount?: number;
}

export async function logActivity(uid: string, entry: ActivityInput) {
  try {
    const cleanEntry = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
    await addDoc(collection(requireDb(), "users", uid, "events"), {
      ...cleanEntry,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw normalizeError(error);
  }
}

export interface ActivityItem extends ActivityInput {
  id: string;
  createdAt: Date | null;
}

function activityFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): ActivityItem {
  return {
    id: snapshot.id,
    action: snapshot.get("action"),
    module: snapshot.get("module"),
    title: snapshot.get("title"),
    language: snapshot.get("language"),
    characterCount: snapshot.get("characterCount"),
    createdAt: snapshot.get("createdAt")?.toDate() ?? null,
  };
}

export function subscribeActivity(uid: string, onUpdate: (items: ActivityItem[]) => void, onError: (error: Error) => void): Unsubscribe {
  const events = query(collection(requireDb(), "users", uid, "events"), orderBy("createdAt", "desc"), limit(8));
  return onSnapshot(events, (snapshot) => onUpdate(snapshot.docs.map(activityFromSnapshot)), (error) => onError(normalizeError(error)));
}

export async function saveQuizScore(uid: string, score: { title: string; correct: number; total: number }) {
  await addDoc(collection(requireDb(), "users", uid, "quizAttempts"), {
    ...score,
    createdAt: serverTimestamp(),
  });
}

export async function getUserStats(uid: string) {
  const store = requireDb();
  const [events, quizzes] = await Promise.all([
    getCountFromServer(collection(store, "users", uid, "events")),
    getCountFromServer(collection(store, "users", uid, "quizAttempts")),
  ]);
  return { analyses: events.data().count, quizzes: quizzes.data().count };
}

export interface RoomSummary {
  id: string;
  name: string;
  createdBy: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  createdAt: Date | null;
}

function roomFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): RoomSummary {
  return {
    id: snapshot.id,
    name: snapshot.get("name"),
    createdBy: snapshot.get("createdBy"),
    memberIds: snapshot.get("memberIds") ?? [],
    memberNames: snapshot.get("memberNames") ?? {},
    createdAt: snapshot.get("createdAt")?.toDate() ?? null,
  };
}

export function subscribeRooms(onUpdate: (rooms: RoomSummary[]) => void, onError: (error: Error) => void): Unsubscribe {
  const rooms = query(collection(requireDb(), "rooms"), where("isActive", "==", true), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(rooms, (snapshot) => onUpdate(snapshot.docs.map(roomFromSnapshot)), (error) => onError(normalizeError(error)));
}

export async function createRoom(user: User, name: string) {
  const room = await addDoc(collection(requireDb(), "rooms"), {
    name: name.trim(),
    createdBy: user.uid,
    memberIds: [user.uid],
    memberNames: { [user.uid]: user.displayName ?? user.email?.split("@")[0] ?? "Learner" },
    isActive: true,
    createdAt: serverTimestamp(),
  });
  return room.id;
}

export async function joinRoom(user: User, roomId: string) {
  await updateDoc(doc(requireDb(), "rooms", roomId), {
    memberIds: arrayUnion(user.uid),
    [`memberNames.${user.uid}`]: user.displayName ?? user.email?.split("@")[0] ?? "Learner",
  });
}

export interface RoomMessageItem {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  isAI: boolean;
  createdAt: Date | null;
}

function messageFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): RoomMessageItem {
  return {
    id: snapshot.id,
    authorId: snapshot.get("authorId"),
    authorName: snapshot.get("authorName"),
    text: snapshot.get("text"),
    isAI: snapshot.get("isAI") === true,
    createdAt: snapshot.get("createdAt")?.toDate() ?? null,
  };
}

export function subscribeRoomMessages(roomId: string, onUpdate: (messages: RoomMessageItem[]) => void, onError: (error: Error) => void): Unsubscribe {
  const messages = query(collection(requireDb(), "rooms", roomId, "messages"), orderBy("createdAt", "asc"), limit(100));
  return onSnapshot(messages, (snapshot) => onUpdate(snapshot.docs.map(messageFromSnapshot)), (error) => onError(normalizeError(error)));
}

export interface RoomBoard {
  content: string;
  diagram: string;
  updatedBy: string;
  updatedAt: Date | null;
}

export function subscribeRoomBoard(roomId: string, onUpdate: (board: RoomBoard) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(doc(requireDb(), "rooms", roomId, "board", "shared"), (snapshot) => {
    onUpdate({
      content: snapshot.exists() ? snapshot.get("content") : "",
      diagram: snapshot.exists() ? snapshot.get("diagram") ?? "" : "",
      updatedBy: snapshot.exists() ? snapshot.get("updatedBy") : "",
      updatedAt: snapshot.exists() ? snapshot.get("updatedAt")?.toDate() ?? null : null,
    });
  }, (error) => onError(normalizeError(error)));
}

export async function saveRoomBoard(user: User, roomId: string, content: string, diagram = "") {
  await setDoc(doc(requireDb(), "rooms", roomId, "board", "shared"), {
    content: content.slice(0, 10000),
    diagram: diagram.slice(0, 30000),
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function sendRoomMessage(user: User, roomId: string, text: string, isAI = false) {
  await addDoc(collection(requireDb(), "rooms", roomId, "messages"), {
    authorId: user.uid,
    authorName: isAI ? "OmniLearn AI Tutor" : user.displayName ?? user.email?.split("@")[0] ?? "Learner",
    text: text.trim(),
    ...(isAI ? { isAI: true } : {}),
    createdAt: serverTimestamp(),
  });
}

export interface RoomDocumentItem {
  id: string;
  ownerUid: string;
  name: string;
  format: string;
  bytes: number;
  publicId: string;
  textContent: string;
  createdAt: Date | null;
}

export function subscribeRoomDocuments(
  roomId: string,
  onUpdate: (documents: RoomDocumentItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const documents = query(
    collection(requireDb(), "rooms", roomId, "documents"),
    orderBy("createdAt", "desc"),
    limit(30),
  );
  return onSnapshot(documents, (snapshot) => onUpdate(snapshot.docs.map((item) => ({
    id: item.id,
    ownerUid: item.get("ownerUid"),
    name: item.get("name"),
    format: item.get("format"),
    bytes: item.get("bytes"),
    publicId: item.get("publicId"),
    textContent: item.get("textContent") ?? "",
    createdAt: item.get("createdAt")?.toDate() ?? null,
  }))), (error) => onError(normalizeError(error)));
}

export async function createRoomDocument(
  user: User,
  roomId: string,
  document: Omit<RoomDocumentItem, "id" | "createdAt">,
) {
  await addDoc(collection(requireDb(), "rooms", roomId, "documents"), {
    ...document,
    ownerUid: user.uid,
    createdAt: serverTimestamp(),
  });
}

export async function deleteRoomDocument(roomId: string, documentId: string) {
  await deleteDoc(doc(requireDb(), "rooms", roomId, "documents", documentId));
}

export interface RoomMeeting {
  id: string;
  hostUid: string;
  hostName: string;
  status: "active" | "ended";
  startedAt: Date | null;
}

export interface RoomMeetingParticipant {
  uid: string;
  name: string;
  sessionId: string;
  lastSeenAt: Date | null;
}

function meetingRef(roomId: string) {
  return doc(requireDb(), "rooms", roomId, "meetings", "current");
}

export function subscribeRoomMeeting(
  roomId: string,
  onUpdate: (meeting: RoomMeeting | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(meetingRef(roomId), (snapshot) => {
    onUpdate(snapshot.exists() ? {
      id: snapshot.id,
      hostUid: snapshot.get("hostUid"),
      hostName: snapshot.get("hostName"),
      status: snapshot.get("status"),
      startedAt: snapshot.get("startedAt")?.toDate() ?? null,
    } : null);
  }, (error) => onError(normalizeError(error)));
}

export async function startRoomMeeting(user: User, roomId: string) {
  await setDoc(meetingRef(roomId), {
    hostUid: user.uid,
    hostName: user.displayName ?? user.email?.split("@")[0] ?? "Room host",
    status: "active",
    startedAt: serverTimestamp(),
  });
}

export async function endRoomMeeting(user: User, roomId: string) {
  await updateDoc(meetingRef(roomId), {
    status: "ended",
    endedBy: user.uid,
    endedAt: serverTimestamp(),
  });
}

export async function closeStudyRoom(roomId: string) {
  await updateDoc(doc(requireDb(), "rooms", roomId), { isActive: false });
}

function meetingParticipantsRef(roomId: string) {
  return collection(requireDb(), "rooms", roomId, "meetings", "current", "participants");
}

export function subscribeMeetingParticipants(
  roomId: string,
  onUpdate: (participants: RoomMeetingParticipant[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(meetingParticipantsRef(roomId), (snapshot) => {
    onUpdate(snapshot.docs.map((participant) => ({
      uid: participant.id,
      name: participant.get("name"),
      sessionId: participant.get("sessionId"),
      lastSeenAt: participant.get("lastSeenAt")?.toDate() ?? null,
    })));
  }, (error) => onError(normalizeError(error)));
}

export async function joinRoomMeeting(user: User, roomId: string, sessionId: string) {
  await setDoc(doc(meetingParticipantsRef(roomId), user.uid), {
    name: user.displayName ?? user.email?.split("@")[0] ?? "Learner",
    sessionId,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
}

export async function refreshRoomMeetingPresence(user: User, roomId: string) {
  await updateDoc(doc(meetingParticipantsRef(roomId), user.uid), { lastSeenAt: serverTimestamp() });
}

export async function leaveRoomMeeting(user: User, roomId: string) {
  await deleteDoc(doc(meetingParticipantsRef(roomId), user.uid));
}

export function roomMeetingSignalId(
  firstUid: string,
  firstSessionId: string,
  secondUid: string,
  secondSessionId: string,
) {
  const first = firstUid < secondUid
    ? `${firstUid}_${firstSessionId}`
    : `${secondUid}_${secondSessionId}`;
  const second = firstUid < secondUid
    ? `${secondUid}_${secondSessionId}`
    : `${firstUid}_${firstSessionId}`;
  return `${first}__${second}`;
}

export interface RoomMeetingSignal {
  fromUid: string;
  toUid: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
}

function roomSignalRef(roomId: string, signalId: string) {
  return doc(requireDb(), "rooms", roomId, "meetings", "current", "signals", signalId);
}

export function subscribeRoomMeetingSignal(
  roomId: string,
  signalId: string,
  onUpdate: (signal: RoomMeetingSignal | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(roomSignalRef(roomId, signalId), (snapshot) => {
    onUpdate(snapshot.exists() ? {
      fromUid: snapshot.get("fromUid"),
      toUid: snapshot.get("toUid"),
      offer: snapshot.get("offer"),
      answer: snapshot.get("answer"),
    } : null);
  }, (error) => onError(normalizeError(error)));
}

export async function publishRoomMeetingOffer(
  roomId: string,
  signalId: string,
  fromUid: string,
  toUid: string,
  offer: RTCSessionDescriptionInit,
) {
  await setDoc(roomSignalRef(roomId, signalId), {
    fromUid,
    toUid,
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: serverTimestamp(),
  });
}

export async function publishRoomMeetingAnswer(roomId: string, signalId: string, answer: RTCSessionDescriptionInit) {
  await updateDoc(roomSignalRef(roomId, signalId), {
    answer: { type: answer.type, sdp: answer.sdp },
  });
}

export interface RoomIceCandidate {
  id: string;
  fromUid: string;
  toUid: string;
  candidate: RTCIceCandidateInit;
}

function roomCandidatesRef(roomId: string, signalId: string) {
  return collection(roomSignalRef(roomId, signalId), "candidates");
}

export function subscribeRoomMeetingCandidates(
  roomId: string,
  signalId: string,
  toUid: string,
  onUpdate: (candidates: RoomIceCandidate[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(roomCandidatesRef(roomId, signalId), (snapshot) => {
    onUpdate(snapshot.docs
      .filter((candidate) => candidate.get("toUid") === toUid)
      .map((candidate) => ({
        id: candidate.id,
        fromUid: candidate.get("fromUid"),
        toUid: candidate.get("toUid"),
        candidate: candidate.get("candidate"),
      })));
  }, (error) => onError(normalizeError(error)));
}

export async function publishRoomMeetingCandidate(
  roomId: string,
  signalId: string,
  fromUid: string,
  toUid: string,
  candidate: RTCIceCandidate,
) {
  await addDoc(roomCandidatesRef(roomId, signalId), {
    fromUid,
    toUid,
    candidate: candidate.toJSON(),
    createdAt: serverTimestamp(),
  });
}

export interface ReportInput {
  category: "bug" | "abuse" | "content";
  description: string;
  roomId?: string;
  targetUserId?: string;
}

export async function createReport(user: User, report: ReportInput) {
  await addDoc(collection(requireDb(), "reports"), {
    ...report,
    reporterUid: user.uid,
    reporterEmail: user.email ?? "",
    status: "open",
    createdAt: serverTimestamp(),
  });
}

export interface ReportItem extends ReportInput {
  id: string;
  reporterUid: string;
  reporterEmail: string;
  status: "open" | "processing" | "resolved";
  moderationAction?: "resolve" | "close-room" | "ban-user";
  moderationNote?: string;
  moderatedBy?: string;
  createdAt: Date | null;
}

export function subscribeReports(onUpdate: (reports: ReportItem[]) => void, onError: (error: Error) => void): Unsubscribe {
  const reports = query(collection(requireDb(), "reports"), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(reports, (snapshot) => onUpdate(snapshot.docs.map((item) => ({
    id: item.id,
    category: item.get("category"),
    description: item.get("description"),
    roomId: item.get("roomId"),
    targetUserId: item.get("targetUserId"),
    reporterUid: item.get("reporterUid"),
    reporterEmail: item.get("reporterEmail"),
    status: item.get("status"),
    moderationAction: item.get("moderationAction"),
    moderationNote: item.get("moderationNote"),
    moderatedBy: item.get("moderatedBy"),
    createdAt: item.get("createdAt")?.toDate() ?? null,
  }))), (error) => onError(normalizeError(error)));
}

export async function getAdminStats() {
  const store = requireDb();
  const [users, rooms, openReports, events] = await Promise.all([
    getCountFromServer(collection(store, "users")),
    getCountFromServer(query(collection(store, "rooms"), where("isActive", "==", true))),
    getCountFromServer(query(collection(store, "reports"), where("status", "==", "open"))),
    getCountFromServer(collectionGroup(store, "events")),
  ]);
  return { users: users.data().count, rooms: rooms.data().count, reports: openReports.data().count, events: events.data().count };
}

export interface UserSummary {
  uid: string;
  email: string;
  displayName: string;
  isBanned: boolean;
  isAdmin: boolean;
  createdAt: Date | null;
}

export function subscribeUsers(onUpdate: (users: UserSummary[]) => void, onError: (error: Error) => void): Unsubscribe {
  const users = query(collection(requireDb(), "users"), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(users, (snapshot) => onUpdate(snapshot.docs.map((item) => ({
    uid: item.id,
    email: item.get("email") ?? "",
    displayName: item.get("displayName") ?? "Learner",
    isBanned: item.get("isBanned") === true,
    isAdmin: item.get("isAdmin") === true,
    createdAt: item.get("createdAt")?.toDate() ?? null,
  }))), (error) => onError(normalizeError(error)));
}

export async function setUserBanned(uid: string, isBanned: boolean) {
  if (!auth?.currentUser || auth.currentUser.uid === uid) {
    throw new Error("You cannot change your own account access.");
  }
  await updateDoc(doc(requireDb(), "users", uid), { isBanned });
}

export async function moderateReport(report: ReportItem, action: "resolve" | "close-room" | "ban-user", note = "") {
  const actorUid = auth?.currentUser?.uid;
  if (!actorUid) throw new Error("Sign in again before moderating a report.");
  if (report.status !== "open"
    && !(report.status === "processing" && report.moderatedBy === actorUid && report.moderationAction === action)) {
    throw new Error("This report is already being handled or has been resolved.");
  }
  if (action === "close-room" && !report.roomId) throw new Error("This report does not include a room to close.");
  if (action === "ban-user" && (!report.targetUserId || report.targetUserId === actorUid)) {
    throw new Error("This report does not identify another account to suspend.");
  }

  const store = requireDb();
  const batch = writeBatch(store);
  if (action === "close-room" && report.roomId) {
    const roomRef = doc(store, "rooms", report.roomId);
    const room = await getDoc(roomRef);
    if (room.exists() && room.get("isActive") === true) batch.update(roomRef, { isActive: false });
  }
  if (action === "ban-user" && report.targetUserId) {
    batch.update(doc(store, "users", report.targetUserId), { isBanned: true });
  }
  batch.update(doc(store, "reports", report.id), {
    status: "resolved",
    moderationAction: action,
    moderationNote: note.slice(0, 500),
    moderatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export function asFirestoreTimestamp(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}
