import { NextRequest, NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import { getScheduler } from "@/lib/scheduler";
import type { Schedule, ScheduleDroplet } from "@/lib/db";

export async function GET() {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = await getDb();
  const schedules = (await db.all(
    "SELECT * FROM schedules ORDER BY created_at DESC"
  )) as Schedule[];

  const result = await Promise.all(
    schedules.map(async (s) => {
      const droplets = (await db.all(
        "SELECT * FROM schedule_droplets WHERE schedule_id = $1",
        [s.id]
      )) as ScheduleDroplet[];

      return {
        ...s,
        droplets: droplets.map((d) => ({
          ...d,
          tags: JSON.parse(d.tags || "[]"),
        })),
      };
    })
  );

  return NextResponse.json({ schedules: result });
}

export async function POST(req: NextRequest) {
  const apiKey = await getSetting("api_key");
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
    return NextResponse.json(
      { error: "At least one droplet required" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  const scheduleId = await db.insert(
    `INSERT INTO schedules (name, delete_day, delete_hour, delete_minute, recreate_day, recreate_hour, recreate_minute, timezone, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      name || null,
      deleteDay,
      deleteHour,
      deleteMinute,
      recreateDay,
      recreateHour,
      recreateMinute,
      timezone,
      now,
      now,
    ]
  );

  for (const d of droplets) {
    await db.run(
      `INSERT INTO schedule_droplets (schedule_id, droplet_id, droplet_name, region, size, tags, image_id, image_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        scheduleId,
        d.id,
        d.name,
        d.region,
        d.size,
        JSON.stringify(d.tags || []),
        d.imageId || null,
        d.imageName || null,
      ]
    );
  }

  const schedule = (await db.get("SELECT * FROM schedules WHERE id = $1", [
    scheduleId,
  ])) as Schedule;

  getScheduler().registerSchedule(schedule);

  return NextResponse.json({ success: true, scheduleId });
}
