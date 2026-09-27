import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReminders } from "@/modules/reminders/service";

/** Tâche quotidienne des rappels (J-7 … J+7). Protégée par CRON_SECRET (en-tête Authorization: Bearer …). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret === "change-moi" || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret)))
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  const res = await runReminders();
  return NextResponse.json({ ok: true, ...res });
}
