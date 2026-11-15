import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cafe";
import { sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function GET() {
  const token = (await cookies()).get(sessionCookie)?.value;
  return NextResponse.json(
    { authenticated: await isAuthenticated(token) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
