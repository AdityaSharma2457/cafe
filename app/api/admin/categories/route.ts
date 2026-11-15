import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCategory, isAuthenticated } from "@/lib/cafe";
import { errorResponse, originAllowed, readJson, sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!(await isAuthenticated(token))) return NextResponse.json({ error: "Please sign in as the chef." }, { status: 401 });
  try {
    const data = await readJson(request);
    return NextResponse.json(await createCategory(data.name), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
