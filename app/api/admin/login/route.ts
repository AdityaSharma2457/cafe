import { NextResponse } from "next/server";
import { newSessionToken, sessionDuration, verifyAdminPassword } from "@/lib/cafe";
import { errorResponse, originAllowed, readJson, sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  try {
    const data = await readJson(request);
    if (!verifyAdminPassword(data.password)) {
      return NextResponse.json({ error: "Incorrect chef password." }, { status: 401 });
    }
    const token = newSessionToken();
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(sessionCookie, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionDuration(),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
