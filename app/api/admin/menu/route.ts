import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCategories, isAuthenticated } from "@/lib/cafe";
import { sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function GET() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!isAuthenticated(token)) return NextResponse.json({ error: "Please sign in as the chef." }, { status: 401 });
  return NextResponse.json(
    { categories: getCategories(true) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
