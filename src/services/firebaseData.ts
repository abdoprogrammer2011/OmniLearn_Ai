import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
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
  createdAt: Date | null;
}

function messageFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): RoomMessageItem {
  return {
    id: snapshot.id,
    authorId: snapshot.get("authorId"),
    authorName: snapshot.get("authorName"),
    text: snapshot.get("text"),
    createdAt: snapshot.get("createdAt")?.toDate() ?? null,
  };
}

export function subscribeRoomMessages(roomId: string, onUpdate: (messages: RoomMessageItem[]) => void, onError: (error: Error) => void): Unsubscribe {
  const messages = query(collection(requireDb(), "rooms", roomId, "messages"), orderBy("createdAt", "asc"), limit(100));
  return onSnapshot(messages, (snapshot) => onUpdate(snapshot.docs.map(messageFromSnapshot)), (error) => onError(normalizeError(error)));
}

export interface RoomBoard {
  content: string;
  updatedBy: string;
  updatedAt: Date | null;
}

export function subscribeRoomBoard(roomId: string, onUpdate: (board: RoomBoard) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(doc(requireDb(), "rooms", roomId, "board", "shared"), (snapshot) => {
    onUpdate({
      content: snapshot.exists() ? snapshot.get("content") : "",
      updatedBy: snapshot.exists() ? snapshot.get("updatedBy") : "",
      updatedAt: snapshot.exists() ? snapshot.get("updatedAt")?.toDate() ?? null : null,
    });
  }, (error) => onError(normalizeError(error)));
}

export async function saveRoomBoard(user: User, roomId: string, content: string) {
  await setDoc(doc(requireDb(), "rooms", roomId, "board", "shared"), {
    content: content.slice(0, 10000),
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function sendRoomMessage(user: User, roomId: string, text: string) {
  await addDoc(collection(requireDb(), "rooms", roomId, "messages"), {
    authorId: user.uid,
    authorName: user.displayName ?? user.email?.split("@")[0] ?? "Learner",
    text: text.trim(),
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
