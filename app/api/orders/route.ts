import { NextResponse } from "next/server";
import { createOrder } from "@/lib/cafe";
import { errorResponse, originAllowed, readJson } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  try {
    const result = createOrder(await readJson(request));
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
