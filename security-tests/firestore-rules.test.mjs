import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { arrayUnion, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

const projectId = "demo-omnilearn-security";
let environment;

async function seedProfile(uid, { isAdmin = false, isBanned = false } = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid), {
      displayName: uid,
      email: `${uid}@example.com`,
      photoURL: "",
      createdAt: new Date(),
      isAdmin,
      isBanned,
    });
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

after(async () => {
  await environment?.cleanup();
});

test("verified users can create their own constrained profile and activity", async () => {
  const context = environment.authenticatedContext("learner-1", {
    email: "learner@example.com",
    email_verified: true,
  });
  const store = context.firestore();

  await assertSucceeds(setDoc(doc(store, "users/learner-1"), {
    displayName: "Learner One",
    email: "learner@example.com",
    photoURL: "",
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(store, "users/learner-1/events/event-1"), {
    action: "explain",
    module: "code",
    title: "Explain code · Python",
    language: "Python",
    characterCount: 82,
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(store, "users/learner-1/events/event-2"), {
    action: "complexity",
    module: "code",
    title: "Big-O complexity · Python",
    characterCount: 82,
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(store, "users/learner-1/events/event-3"), {
    action: "Ask document",
    module: "study",
    title: "Study material",
    characterCount: 120,
    createdAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(store, "aiUsage/learner-1_2026-10-06")));
  await assertFails(setDoc(doc(store, "aiUsage/learner-1_2026-10-06"), {
    uid: "learner-1",
    requests: 1,
  }));
});

test("unverified, cross-user, and role-escalation reads or writes are denied", async () => {
  const verified = environment.authenticatedContext("learner-2", {
    email: "learner2@example.com",
    email_verified: true,
  });
  const unverified = environment.authenticatedContext("unverified", {
    email: "unverified@example.com",
    email_verified: false,
  });
  const attacker = environment.authenticatedContext("attacker", {
    email: "attacker@example.com",
    email_verified: true,
  });

  await assertFails(getDoc(doc(unverified.firestore(), "users/unverified")));
  await assertFails(getDoc(doc(attacker.firestore(), "users/learner-1")));
  await assertFails(setDoc(doc(verified.firestore(), "users/learner-2"), {
    displayName: "Learner Two",
    email: "learner2@example.com",
    photoURL: "",
    role: "admin",
    createdAt: serverTimestamp(),
  }));
});

test("reports are writable by their reporter and readable only by admins", async () => {
  await seedProfile("reporter");
  await seedProfile("moderator", { isAdmin: true });
  const reporter = environment.authenticatedContext("reporter", {
    email: "reporter@example.com",
    email_verified: true,
  });
  const userReport = {
    category: "bug",
    description: "The workspace export button fails when clicked.",
    reporterUid: "reporter",
    reporterEmail: "reporter@example.com",
    status: "open",
    createdAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(reporter.firestore(), "reports/report-1"), userReport));
  await assertFails(getDoc(doc(reporter.firestore(), "reports/report-1")));

  const admin = environment.authenticatedContext("moderator", {
    email: "moderator@example.com",
    email_verified: true,
  });
  await assertSucceeds(getDoc(doc(admin.firestore(), "reports/report-1")));
  await assertSucceeds(updateDoc(doc(admin.firestore(), "reports/report-1"), {
    status: "resolved",
    moderationAction: "resolve",
    moderationNote: "",
    moderatedBy: "moderator",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(reporter.firestore(), "reports/report-1"), {
    status: "resolved",
    moderationAction: "resolve",
    moderationNote: "",
    moderatedBy: "reporter",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(admin.firestore(), "reports/report-1"), {
    status: "resolved",
    moderationAction: "resolve",
    moderationNote: "",
    moderatedBy: "moderator",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(reporter.firestore(), "reports/report-2"), {
    ...userReport,
    reporterUid: "another-user",
  }));
});

test("study room owners and joined members can exchange messages, but outsiders cannot", async () => {
  await Promise.all(["room-owner", "room-member", "room-outsider"].map((uid) => seedProfile(uid)));
  const owner = environment.authenticatedContext("room-owner", {
    email: "owner@example.com",
    email_verified: true,
  });
  const member = environment.authenticatedContext("room-member", {
    email: "member@example.com",
    email_verified: true,
  });
  const outsider = environment.authenticatedContext("room-outsider", {
    email: "outsider@example.com",
    email_verified: true,
  });
  const roomRef = doc(owner.firestore(), "rooms/study-room");

  await assertSucceeds(setDoc(roomRef, {
    name: "Study group",
    createdBy: "room-owner",
    memberIds: ["room-owner"],
    memberNames: { "room-owner": "Room Owner" },
    isActive: true,
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(member.firestore(), "rooms/study-room"), {
    memberIds: arrayUnion("room-member"),
    "memberNames.room-member": "Room Member",
  }));
  await assertSucceeds(setDoc(doc(collection(member.firestore(), "rooms/study-room/messages"), "message-1"), {
    authorId: "room-member",
    authorName: "Room Member",
    text: "Ready to review the first question.",
    createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(collection(outsider.firestore(), "rooms/study-room/messages"), "message-2"), {
    authorId: "room-outsider",
    authorName: "Room Outsider",
    text: "This should not be accepted.",
    createdAt: serverTimestamp(),
  }));
});

test("active study-room members can collaborate on a shared notes board", async () => {
  await Promise.all(["board-owner", "board-member", "board-outsider"].map((uid) => seedProfile(uid)));
  const owner = environment.authenticatedContext("board-owner", {
    email: "board-owner@example.com",
    email_verified: true,
  });
  const member = environment.authenticatedContext("board-member", {
    email: "board-member@example.com",
    email_verified: true,
  });
  const outsider = environment.authenticatedContext("board-outsider", {
    email: "board-outsider@example.com",
    email_verified: true,
  });
  const roomRef = doc(owner.firestore(), "rooms/board-room");
  await assertSucceeds(setDoc(roomRef, {
    name: "Board study group",
    createdBy: "board-owner",
    memberIds: ["board-owner"],
    memberNames: { "board-owner": "Board Owner" },
    isActive: true,
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(member.firestore(), "rooms/board-room"), {
    memberIds: arrayUnion("board-member"),
    "memberNames.board-member": "Board Member",
  }));

  const board = doc(owner.firestore(), "rooms/board-room/board/shared");
  await assertSucceeds(setDoc(board, {
    content: "Review the key definitions together.",
    updatedBy: "board-owner",
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(doc(member.firestore(), "rooms/board-room/board/shared")));
  await assertSucceeds(setDoc(doc(member.firestore(), "rooms/board-room/board/shared"), {
    content: "Review the key definitions and add examples.",
    updatedBy: "board-member",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(outsider.firestore(), "rooms/board-room/board/shared")));
  await assertFails(setDoc(doc(outsider.firestore(), "rooms/board-room/board/shared"), {
    content: "An outsider must not edit this board.",
    updatedBy: "board-outsider",
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(member.firestore(), "rooms/board-room/board/shared"), {
    content: "Attempt to add an unvalidated admin field.",
    updatedBy: "board-member",
    updatedAt: serverTimestamp(),
    admin: true,
  }));
});

test("admins may inspect and close rooms without deleting nested content", async () => {
  await seedProfile("room-admin", { isAdmin: true });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "rooms/moderated-room"), {
      name: "Reported room",
      createdBy: "room-owner",
      memberIds: ["room-owner"],
      memberNames: { "room-owner": "Room Owner" },
      isActive: true,
      createdAt: new Date(),
    });
  });
  const admin = environment.authenticatedContext("room-admin", {
    email: "room-admin@example.com",
    email_verified: true,
  });
  const room = doc(admin.firestore(), "rooms/moderated-room");
  await assertSucceeds(updateDoc(room, { isActive: false }));
  await assertSucceeds(getDoc(room));
  await assertSucceeds(getDoc(doc(admin.firestore(), "rooms/missing-room")));
  await assertFails(updateDoc(room, { isActive: true }));
});

test("banned users can read their status but cannot access protected Firestore data", async () => {
  await seedProfile("banned-user", { isBanned: true });
  const banned = environment.authenticatedContext("banned-user", {
    email: "banned@example.com",
    email_verified: true,
  });
  await assertSucceeds(getDoc(doc(banned.firestore(), "users/banned-user")));
  await assertFails(getDoc(doc(banned.firestore(), "users/banned-user/events/private")));
  await assertFails(setDoc(doc(banned.firestore(), "reports/banned-report"), {
    category: "bug",
    description: "Banned accounts must not create reports.",
    reporterUid: "banned-user",
    reporterEmail: "banned@example.com",
    status: "open",
    createdAt: serverTimestamp(),
  }));
});

test("admins can suspend other users, but no client can grant itself admin rights", async () => {
  await seedProfile("trusted-admin", { isAdmin: true });
  await seedProfile("other-admin", { isAdmin: true });
  await seedProfile("target-user");
  const admin = environment.authenticatedContext("trusted-admin", {
    email: "trusted-admin@example.com",
    email_verified: true,
  });
  const target = environment.authenticatedContext("target-user", {
    email: "target-user@example.com",
    email_verified: true,
  });
  await assertSucceeds(updateDoc(doc(admin.firestore(), "users/target-user"), { isBanned: true }));
  await assertFails(updateDoc(doc(admin.firestore(), "users/other-admin"), { isBanned: true }));
  await assertFails(updateDoc(doc(target.firestore(), "users/target-user"), { isAdmin: true }));
  await assertFails(updateDoc(doc(admin.firestore(), "users/trusted-admin"), { isBanned: true }));
});
