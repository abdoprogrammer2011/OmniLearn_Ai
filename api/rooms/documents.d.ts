import type { IncomingHttpHeaders } from "node:http";

interface RoomDocumentsRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

interface RoomDocumentsResponse {
  setHeader(name: string, value: string): unknown;
  status(statusCode: number): RoomDocumentsResponse;
  json(body: unknown): RoomDocumentsResponse;
}

declare function handler(
  request: RoomDocumentsRequest,
  response: RoomDocumentsResponse,
): Promise<unknown>;

export default handler;
