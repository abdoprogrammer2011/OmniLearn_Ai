import type { User } from "firebase/auth";
import { doc, getDoc, getFirestore, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { firebaseApp } from "../firebase";

export interface UserAccess {
  isAdmin: boolean;
  isBanned: boolean;
}

export async function ensureUserProfile(user: User) {
  if (!firebaseApp) throw new Error("Firebase is not configured. Add your VITE_FIREBASE_* values to .env.local.");
  const store = getFirestore(firebaseApp);
  const profileRef = doc(store, "users", user.uid);
  const profile = {
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "Learner",
    photoURL: user.photoURL ?? "",
  };
  await runTransaction(store, async (transaction) => {
    const existing = await transaction.get(profileRef);
    if (existing.exists()) {
      transaction.update(profileRef, profile);
      return;
    }

    transaction.set(profileRef, {
      ...profile,
      email: user.email ?? "",
      createdAt: serverTimestamp(),
    });
  });
}

export async function getUserAccess(uid: string): Promise<UserAccess> {
  if (!firebaseApp) throw new Error("Firebase is not configured. Add your VITE_FIREBASE_* values to .env.local.");
  const profile = await getDoc(doc(getFirestore(firebaseApp), "users", uid));
  if (!profile.exists()) throw new Error("Your secure profile could not be found. Refresh and try again.");
  return {
    isAdmin: profile.get("isAdmin") === true,
    isBanned: profile.get("isBanned") === true,
  };
}

export function subscribeUserAccess(
  uid: string,
  onUpdate: (access: UserAccess) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!firebaseApp) throw new Error("Firebase is not configured. Add your VITE_FIREBASE_* values to .env.local.");
  return onSnapshot(doc(getFirestore(firebaseApp), "users", uid), (profile) => {
    if (!profile.exists()) {
      onError(new Error("Your secure profile could not be found."));
      return;
    }
    onUpdate({
      isAdmin: profile.get("isAdmin") === true,
      isBanned: profile.get("isBanned") === true,
    });
  }, onError);
}
