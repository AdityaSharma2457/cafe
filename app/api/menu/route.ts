import { NextResponse } from "next/server";
import { getCategories } from "@/lib/cafe";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ categories: getCategories() }, { headers: { "Cache-Control": "no-store" } });
}
