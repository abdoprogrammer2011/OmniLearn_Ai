import { handleOpenRouterRequest } from "../../server/openRouterProxy.js";

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    const body = await request.text();
    if (body.length > 4_200_000) {
      return Response.json({ error: "The AI request is too large." }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "A valid JSON request body is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const result = await handleOpenRouterRequest({
    payload,
    authorization: request.headers.get("authorization"),
    env,
    origin: request.headers.get("origin"),
  });
  return Response.json(result.body, { status: result.status, headers: result.headers });
}

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }
}
