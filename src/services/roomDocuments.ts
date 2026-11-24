import type { User } from "firebase/auth";
import {
  createRoomDocument,
  deleteRoomDocument,
  type RoomDocumentItem,
} from "./firebaseData";
import { extractDocumentText } from "./documentText";

const maxFileBytes = 10_000_000;

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  publicId: string;
  timestamp: number;
  type: "authenticated";
  signature: string;
  resourceType: "raw";
}

async function postRoomDocumentAction(
  user: User,
  action: "sign-upload" | "download" | "delete" | "abort-upload",
  roomId: string,
  extra: Record<string, string | number> = {},
): Promise<Record<string, unknown>> {
  const token = await user.getIdToken();
  const response = await fetch("/api/rooms/documents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, roomId, ...extra }),
  });
  const result: unknown = await response.json().catch(() => null);
  const resultRecord = asRecord(result);
  if (!response.ok) {
    throw new Error(typeof resultRecord?.error === "string" ? resultRecord.error : `Room document request failed (${response.status}).`);
  }
  if (!resultRecord) throw new Error("The room document service returned an invalid response.");
  return resultRecord;
}

export async function uploadRoomDocument(
  user: User,
  roomId: string,
  file: File,
): Promise<{ textAvailable: boolean; extractionWarning: string }> {
  if (file.size <= 0 || file.size > maxFileBytes) throw new Error("Choose a document smaller than 10 MB.");
  const signatureResponse = await postRoomDocumentAction(user, "sign-upload", roomId, {
    filename: file.name,
    bytes: file.size,
  });
  if (typeof signatureResponse.cloudName !== "string"
    || typeof signatureResponse.apiKey !== "string"
    || typeof signatureResponse.publicId !== "string"
    || typeof signatureResponse.timestamp !== "number"
    || signatureResponse.type !== "authenticated"
    || typeof signatureResponse.signature !== "string"
    || signatureResponse.resourceType !== "raw") {
    throw new Error("The room document service returned invalid upload credentials.");
  }
  const signature: UploadSignature = {
    cloudName: signatureResponse.cloudName,
    apiKey: signatureResponse.apiKey,
    publicId: signatureResponse.publicId,
    timestamp: signatureResponse.timestamp,
    type: "authenticated",
    signature: signatureResponse.signature,
    resourceType: "raw",
  };
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  let textContent = "";
  let extractionWarning = "";
  if (["csv", "md", "pdf", "txt"].includes(extension)) {
    try {
      textContent = await extractDocumentText(file, 30_000);
    } catch (error) {
      extractionWarning = error instanceof Error ? error.message : "The AI tutor could not read text from this file.";
    }
  }
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("public_id", signature.publicId);
  form.append("type", signature.type);
  form.append("signature", signature.signature);

  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/raw/upload`, {
    method: "POST",
    body: form,
  });
  const uploaded: unknown = await uploadResponse.json().catch(() => null);
  const uploadedRecord = asRecord(uploaded);
  const providerError = asRecord(uploadedRecord?.error);
  if (!uploadResponse.ok || uploadedRecord?.public_id !== signature.publicId) {
    throw new Error(typeof providerError?.message === "string"
      ? providerError.message
      : `Cloudinary upload failed (${uploadResponse.status}).`);
  }

  try {
    await createRoomDocument(user, roomId, {
      ownerUid: user.uid,
      name: file.name,
      format: extension,
      bytes: file.size,
      publicId: signature.publicId,
      textContent,
    });
  } catch (error) {
    try {
      await postRoomDocumentAction(user, "abort-upload", roomId, { publicId: signature.publicId });
    } catch (cleanupError) {
      const uploadError = error instanceof Error ? error.message : "The document metadata could not be saved.";
      const removalError = cleanupError instanceof Error ? cleanupError.message : "Cloudinary cleanup failed.";
      throw new Error(`${uploadError} The incomplete Cloudinary file also could not be removed: ${removalError}`);
    }
    throw error;
  }
  return { textAvailable: Boolean(textContent), extractionWarning };
}

export async function getRoomDocumentUrl(user: User, roomId: string, documentId: string): Promise<string> {
  const response = await postRoomDocumentAction(user, "download", roomId, { documentId });
  if (typeof response.url !== "string" || !response.url.startsWith("https://res.cloudinary.com/")) {
    throw new Error("The document service returned an invalid download link.");
  }
  return response.url;
}

export async function removeRoomDocument(user: User, roomId: string, item: RoomDocumentItem): Promise<void> {
  await postRoomDocumentAction(user, "delete", roomId, { documentId: item.id });
  await deleteRoomDocument(roomId, item.id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
