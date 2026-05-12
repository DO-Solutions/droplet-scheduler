import { NextRequest, NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import { getScheduler } from "@/lib/scheduler";
import type { Schedule } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = await getDb();
  const schedule = (await db.get(
    "SELECT * FROM schedules WHERE id = $1",
    [params.id]
  )) as Schedule | undefined;

  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const droplets = await db.all(
    "SELECT * FROM schedule_droplets WHERE schedule_id = $1",
    [schedule.id]
  );

  return NextResponse.json({ schedule: { ...schedule, droplets } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = await getDb();
  const existing = (await db.get(
    "SELECT * FROM schedules WHERE id = $1",
    [params.id]
  )) as Schedule | undefined;

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

  const now = Math.floor(Date.now() / 1000);

  await db.run(
    `UPDATE schedules SET
      name = COALESCE($1, name),
      delete_day = COALESCE($2, delete_day),
      delete_hour = COALESCE($3, delete_hour),
      delete_minute = COALESCE($4, delete_minute),
      recreate_day = COALESCE($5, recreate_day),
      recreate_hour = COALESCE($6, recreate_hour),
      recreate_minute = COALESCE($7, recreate_minute),
      timezone = COALESCE($8, timezone),
      active = COALESCE($9, active),
      updated_at = $10
    WHERE id = $11`,
    [
      name ?? null,
      deleteDay ?? null,
      deleteHour ?? null,
      deleteMinute ?? null,
      recreateDay ?? null,
      recreateHour ?? null,
      recreateMinute ?? null,
      timezone ?? null,
      active !== undefined ? (active ? 1 : 0) : null,
      now,
      params.id,
    ]
  );

  const updated = (await db.get(
    "SELECT * FROM schedules WHERE id = $1",
    [params.id]
  )) as Schedule;

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
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = await getDb();
  const id = parseInt(params.id);

  getScheduler().unregisterSchedule(id);
  await db.run("DELETE FROM schedules WHERE id = $1", [id]);

  return NextResponse.json({ success: true });
}
