import { NextRequest, NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import { getScheduler } from "@/lib/scheduler";
import type { Schedule } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const schedule = db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .get(params.id) as Schedule | undefined;

  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const droplets = db
    .prepare("SELECT * FROM schedule_droplets WHERE schedule_id = ?")
    .all(schedule.id);

  return NextResponse.json({ schedule: { ...schedule, droplets } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .get(params.id) as Schedule | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name,
    deleteDay,
    deleteHour,
    deleteMinute,
    recreateDay,
    recreateHour,
    recreateMinute,
    timezone,
    active,
  } = body;

  db.prepare(
    `UPDATE schedules SET
      name = COALESCE(?, name),
      delete_day = COALESCE(?, delete_day),
      delete_hour = COALESCE(?, delete_hour),
      delete_minute = COALESCE(?, delete_minute),
      recreate_day = COALESCE(?, recreate_day),
      recreate_hour = COALESCE(?, recreate_hour),
      recreate_minute = COALESCE(?, recreate_minute),
      timezone = COALESCE(?, timezone),
      active = COALESCE(?, active),
      updated_at = unixepoch()
    WHERE id = ?`
  ).run(
    name ?? null,
    deleteDay ?? null,
    deleteHour ?? null,
    deleteMinute ?? null,
    recreateDay ?? null,
    recreateHour ?? null,
    recreateMinute ?? null,
    timezone ?? null,
    active !== undefined ? (active ? 1 : 0) : null,
    params.id
  );

  const updated = db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .get(params.id) as Schedule;

  // Re-register if active, unregister if inactive
  if (updated.active) {
    getScheduler().registerSchedule(updated);
  } else {
    getScheduler().unregisterSchedule(updated.id);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const id = parseInt(params.id);

  getScheduler().unregisterSchedule(id);
  db.prepare("DELETE FROM schedules WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
