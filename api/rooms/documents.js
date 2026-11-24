import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { ensureNotBanned, ProxyServiceError, verifyFirebaseToken } from "../../server/openRouterProxy.js";

const allowedFormats = new Set(["csv", "docx", "md", "pdf", "pptx", "txt", "xlsx"]);
const maxFileBytes = 10_000_000;

class RoomDocumentError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function getRoom(projectId, token, uid, roomId) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ProxyServiceError("Room access could not be verified because Firestore is unavailable.");
  }
  if (response.status === 404) throw new RoomDocumentError("This study room no longer exists.", 404);
  if (response.status === 401 || response.status === 403) throw new RoomDocumentError("You do not have access to this study room.", 403);
  if (!response.ok) throw new ProxyServiceError("Room access could not be verified because Firestore is unavailable.");
  const room = await response.json();
  const fields = room.fields ?? {};
  const members = fields.memberIds?.arrayValue?.values ?? [];
  if (fields.isActive?.booleanValue !== true
    || !members.some((member) => member.stringValue === uid)) {
    throw new RoomDocumentError("Only active members can share or open room documents.", 403);
  }
  return fields;
}

async function getRoomDocument(projectId, token, roomId, documentId) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}/documents/${encodeURIComponent(documentId)}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ProxyServiceError("Document access could not be verified because Firestore is unavailable.");
  }
  if (response.status === 404) throw new RoomDocumentError("This shared document no longer exists.", 404);
  if (response.status === 401 || response.status === 403) throw new RoomDocumentError("You do not have access to this document.", 403);
  if (!response.ok) throw new ProxyServiceError("Document access could not be verified because Firestore is unavailable.");
  return response.json();
}

function validPublicId(value, roomId) {
  return typeof value === "string"
    && new RegExp(`^rooms/${roomId}/[A-Za-z0-9_-]+/[A-Za-z0-9-]+\\.(csv|docx|md|pdf|pptx|txt|xlsx)$`).test(value);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return send(res, 400, { error: "A valid JSON request body is required." });
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !["sign-upload", "download", "delete", "abort-upload"].includes(payload.action)
    || typeof payload.roomId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.roomId)) {
    return send(res, 400, { error: "A valid room document action is required." });
  }

  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!cloudName || !apiKey || !apiSecret || !projectId) {
    return send(res, 503, { error: "Room document sharing is not configured on the server." });
  }

  let identity;
  try {
    identity = await verifyFirebaseToken(req.headers.authorization, projectId);
    await ensureNotBanned(projectId, identity.token, identity.uid);
  } catch (error) {
    const status = error instanceof ProxyServiceError ? error.status : 401;
    return send(res, status, { error: error instanceof Error ? error.message : "Sign in again to continue." });
  }

  try {
    const roomFields = await getRoom(projectId, identity.token, identity.uid, payload.roomId);
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

    if (payload.action === "sign-upload") {
      if (typeof payload.filename !== "string" || payload.filename.length > 180
        || typeof payload.bytes !== "number" || !Number.isInteger(payload.bytes)
        || payload.bytes <= 0 || payload.bytes > maxFileBytes) {
        return send(res, 400, { error: "Choose a document smaller than 10 MB." });
      }
      const extension = payload.filename.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedFormats.has(extension)) {
        return send(res, 400, { error: "Supported document types are PDF, Word, PowerPoint, Excel, CSV, Markdown, and text." });
      }
      const publicId = `rooms/${payload.roomId}/${identity.uid}/${randomUUID()}.${extension}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const type = "authenticated";
      const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp, type }, apiSecret);
      return send(res, 200, {
        cloudName,
        apiKey,
        publicId,
        timestamp,
        type,
        signature,
        resourceType: "raw",
        ownerUid: identity.uid,
        roomName: roomFields.name?.stringValue ?? "Study room",
      });
    }

    if (payload.action === "abort-upload") {
      if (!validPublicId(payload.publicId, payload.roomId)
        || !payload.publicId.startsWith(`rooms/${payload.roomId}/${identity.uid}/`)) {
        return send(res, 400, { error: "The uploaded document reference is invalid." });
      }
      const result = await cloudinary.uploader.destroy(payload.publicId, {
        resource_type: "raw",
        type: "authenticated",
        invalidate: true,
      });
      if (result.result !== "ok" && result.result !== "not found") {
        return send(res, 502, { error: "Cloudinary could not remove the incomplete upload." });
      }
      return send(res, 200, { deleted: true });
    }

    if (typeof payload.documentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.documentId)) {
      return send(res, 400, { error: "Choose a valid shared room document." });
    }
    const document = await getRoomDocument(projectId, identity.token, payload.roomId, payload.documentId);
    const documentFields = document.fields ?? {};
    const publicId = documentFields.publicId?.stringValue;
    if (!validPublicId(publicId, payload.roomId)) {
      return send(res, 400, { error: "The stored document reference is invalid." });
    }

    if (payload.action === "delete") {
      const ownerUid = documentFields.ownerUid?.stringValue;
      if (identity.uid !== ownerUid && identity.uid !== roomFields.createdBy?.stringValue) {
        return send(res, 403, { error: "Only the uploader or room host can remove this document." });
      }
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "raw",
        type: "authenticated",
        invalidate: true,
      });
      if (result.result !== "ok" && result.result !== "not found") {
        return send(res, 502, { error: "Cloudinary could not remove this room document." });
      }
      return send(res, 200, { deleted: true });
    }

    const url = cloudinary.url(publicId, {
      resource_type: "raw",
      type: "authenticated",
      secure: true,
      sign_url: true,
    });
    return send(res, 200, { url });
  } catch (error) {
    const status = error instanceof ProxyServiceError || error instanceof RoomDocumentError ? error.status : 500;
    return send(res, status, { error: error instanceof Error ? error.message : "Room document access failed." });
  }
}
