import { NextResponse } from "next/server";
import { CafeError } from "@/lib/errors";

export const sessionCookie = "cafe_chef_session";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new CafeError("Content-Type must be application/json.");
  }
  const maxBytes = 1_000_000;
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new CafeError("Request body is missing or too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CafeError("Request body is missing or too large.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new CafeError("Request body is missing or too large.");
    }
    chunks.push(value);
  }
  if (!totalBytes) throw new CafeError("Request body is missing or too large.");
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CafeError("Request body must be valid UTF-8.");
  }
  const data: unknown = JSON.parse(body);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new CafeError("Request body must be a JSON object.");
  }
  return data as Record<string, unknown>;
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof CafeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (message.includes("UNIQUE constraint failed")) {
    return NextResponse.json(
      { error: "That name already exists in this category." },
      { status: 409 },
    );
  }
  if (message.includes("constraint failed")) {
    return NextResponse.json(
      { error: "The data conflicts with an existing record." },
      { status: 409 },
    );
  }
  console.error("Cafe API request failed:", error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === request.headers.get("host") &&
      (parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    return false;
  }
}
