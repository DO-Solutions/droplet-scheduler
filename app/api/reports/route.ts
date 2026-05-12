import { NextRequest, NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import type { Report } from "@/lib/db";

export async function GET(req: NextRequest) {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const eventType = searchParams.get("type");
  const dropletId = searchParams.get("dropletId");

  const db = getDb();

  let query = "SELECT * FROM reports";
  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (eventType) {
    conditions.push("event_type = ?");
    binds.push(eventType);
  }
  if (dropletId) {
    conditions.push("droplet_id = ?");
    binds.push(parseInt(dropletId));
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const reports = db.prepare(query).all(...binds) as Report[];
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM reports${conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : ""}`
      )
      .get(...binds.slice(0, -2)) as { count: number }
  ).count;

  return NextResponse.json({ reports, total, limit, offset });
}
