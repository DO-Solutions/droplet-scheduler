import { NextRequest, NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import type { Report } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const eventType = searchParams.get("type");
  const dropletId = searchParams.get("dropletId");

  const db = await getDb();

  const conditions: string[] = [];
  const filterParams: unknown[] = [];

  if (eventType) {
    filterParams.push(eventType);
    conditions.push(`event_type = $${filterParams.length}`);
  }
  if (dropletId) {
    filterParams.push(parseInt(dropletId));
    conditions.push(`droplet_id = $${filterParams.length}`);
  }

  const whereClause =
    conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

  // Main query: add ORDER BY + LIMIT + OFFSET
  const pageParams = [...filterParams, limit, offset];
  const mainQuery = `SELECT * FROM reports${whereClause} ORDER BY timestamp DESC LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`;

  const reports = (await db.all(mainQuery, pageParams)) as Report[];

  // Count query (reuse same filter params)
  const countRow = await db.get(
    `SELECT COUNT(*) as count FROM reports${whereClause}`,
    filterParams
  );
  const total = Number(countRow?.count ?? 0);

  return NextResponse.json({ reports, total, limit, offset });
}
