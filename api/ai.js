import { handleOpenRouterRequest } from "../server/openRouterProxy.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: "A valid JSON request body is required." });
    }
  }

  const result = await handleOpenRouterRequest({
    payload,
    authorization: req.headers.authorization,
    env: process.env,
    origin: req.headers.origin,
  });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  return res.status(result.status).json(result.body);
}
