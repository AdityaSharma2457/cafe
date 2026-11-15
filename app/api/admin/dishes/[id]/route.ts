import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAuthenticated, updateDishAvailability } from "@/lib/cafe";
import { errorResponse, originAllowed, readJson, sessionCookie } from "@/app/api/_lib";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Request origin was rejected." }, { status: 403 });
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!(await isAuthenticated(token))) return NextResponse.json({ error: "Please sign in as the chef." }, { status: 401 });
  try {
    const { id } = await context.params;
    return NextResponse.json(await updateDishAvailability(id, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
