import assert from "node:assert/strict";
import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { afterEach, test } from "node:test";
import { handleOpenRouterRequest } from "../server/openRouterProxy.js";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const projectId = "omnilearn-proxy-tests";
const keyId = "test-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: keyId };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function firebaseToken({ verified = true } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: keyId })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: "test-user",
    email_verified: verified,
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  const unsigned = `${header}.${claims}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
}

function validPayload() {
  return {
    task: "explain",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    messages: [
      { role: "system", content: "OmniLearn system instruction" },
      { role: "user", content: "Explain this small code sample." },
    ],
  };
}

function mockServices({ banned = false, token } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("securetoken@system.gserviceaccount.com")) {
      return Response.json({ keys: [jwk] }, { headers: { "cache-control": "max-age=3600" } });
    }
    if (url.includes("firestore.googleapis.com")) {
      assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
      return Response.json({ fields: { isBanned: { booleanValue: banned } } });
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return Response.json({ choices: [{ message: { content: "model response" } }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return calls;
}

const request = (payload, token = firebaseToken()) => handleOpenRouterRequest({
  payload,
  authorization: `Bearer ${token}`,
  env: { OPENROUTER_API_KEY: "test-openrouter-secret", FIREBASE_PROJECT_ID: projectId },
  origin: "https://omnilearn.example",
});

test("forwards only allowlisted model requests with the server API key", async () => {
  const token = firebaseToken();
  const calls = mockServices({ token });
  const result = await request(validPayload(), token);
  assert.equal(result.status, 200);
  const providerRequest = calls.find(({ url }) => url.includes("openrouter.ai"));
  assert.ok(providerRequest);
  assert.equal(new Headers(providerRequest.init.headers).get("authorization"), "Bearer test-openrouter-secret");
  const providerBody = JSON.parse(providerRequest.init.body);
  assert.equal(providerBody.model, validPayload().model);
  assert.match(providerBody.messages[0].content, /You are OmniLearn AI Engine/);
  assert.notEqual(providerBody.messages[0].content, validPayload().messages[0].content);
  assert.equal("user" in providerBody, false);
  assert.equal(providerRequest.init.body.includes(firebaseToken()), false);
});

test("rejects suspended accounts before forwarding AI content", async () => {
  const token = firebaseToken();
  const calls = mockServices({ banned: true, token });
  const result = await request(validPayload(), token);
  assert.equal(result.status, 401);
  assert.match(result.body.error, /suspended/i);
  assert.equal(calls.some(({ url }) => url.includes("openrouter.ai")), false);
});

test("rejects unverified Firebase identities", async () => {
  globalThis.fetch = async () => {
    throw new Error("Unverified identities must be rejected before external requests.");
  };
  const result = await request(validPayload(), firebaseToken({ verified: false }));
  assert.equal(result.status, 401);
});

test("rejects models outside the task allowlist and oversized payloads", async () => {
  const token = firebaseToken();
  const calls = mockServices({ token });
  const invalidModel = { ...validPayload(), model: "openai/gpt-4o" };
  const modelResult = await request(invalidModel, token);
  assert.equal(modelResult.status, 400);
  assert.equal(calls.some(({ url }) => url.includes("openrouter.ai")), false);

  const oversized = await request({ content: "x".repeat(4_200_001) });
  assert.equal(oversized.status, 413);
});
