import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { endSession } from "@/lib/cafe";
import { originAllowed, sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  const token = (await cookies()).get(sessionCookie)?.value;
  endSession(token);
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(sessionCookie, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
