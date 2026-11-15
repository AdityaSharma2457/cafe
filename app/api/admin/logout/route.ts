import { NextResponse } from "next/server";
import { originAllowed, sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(sessionCookie, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
