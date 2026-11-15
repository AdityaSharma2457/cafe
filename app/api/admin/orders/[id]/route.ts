import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthenticated, markDelivered } from "@/lib/cafe";
import { errorResponse, originAllowed, readJson, sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!isAuthenticated(token)) return NextResponse.json({ error: "Please sign in as the chef." }, { status: 401 });
  try {
    const { id } = await context.params;
    const data = await readJson(request);
    return NextResponse.json(markDelivered(id, data.status));
  } catch (error) {
    return errorResponse(error);
  }
}
