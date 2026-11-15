import { NextResponse } from "next/server";
import { getCategories } from "@/lib/cafe";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { categories: await getCategories() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
