import { NextRequest, NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import { getScheduler } from "@/lib/scheduler";
import type { Schedule, ScheduleDroplet } from "@/lib/db";

export async function GET() {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const schedules = db.prepare("SELECT * FROM schedules ORDER BY created_at DESC").all() as Schedule[];

  const result = schedules.map((s) => {
    const droplets = db
      .prepare("SELECT * FROM schedule_droplets WHERE schedule_id = ?")
      .all(s.id) as ScheduleDroplet[];

    return {
      ...s,
      droplets: droplets.map((d) => ({
        ...d,
        tags: JSON.parse(d.tags || "[]"),
      })),
    };
  });

  return NextResponse.json({ schedules: result });
}

export async function POST(req: NextRequest) {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    timezone = "UTC",
    droplets,
  } = body;

  if (!Array.isArray(droplets) || droplets.length === 0) {
    return NextResponse.json({ error: "At least one droplet required" }, { status: 400 });
  }

  const db = getDb();

  const scheduleId = db
    .prepare(
      `INSERT INTO schedules (name, delete_day, delete_hour, delete_minute, recreate_day, recreate_hour, recreate_minute, timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name || null,
      deleteDay,
      deleteHour,
      deleteMinute,
      recreateDay,
      recreateHour,
      recreateMinute,
      timezone
    ).lastInsertRowid as number;

  const insertDroplet = db.prepare(
    `INSERT INTO schedule_droplets (schedule_id, droplet_id, droplet_name, region, size, tags, image_id, image_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const d of droplets) {
    insertDroplet.run(
      scheduleId,
      d.id,
      d.name,
      d.region,
      d.size,
      JSON.stringify(d.tags || []),
      d.imageId || null,
      d.imageName || null
    );
  }

  const schedule = db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .get(scheduleId) as Schedule;

  getScheduler().registerSchedule(schedule);

  return NextResponse.json({ success: true, scheduleId });
}
