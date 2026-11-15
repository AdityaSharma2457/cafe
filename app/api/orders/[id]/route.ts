import { NextResponse } from "next/server";
import { getOrderStatus } from "@/lib/cafe";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const order = getOrderStatus(Number(id));
  return order
    ? NextResponse.json(order, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: "Order not found." }, { status: 404 });
}
