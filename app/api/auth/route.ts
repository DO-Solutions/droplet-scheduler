import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { validateApiKey } from "@/lib/digitalocean";
import { getScheduler } from "@/lib/scheduler";

export async function GET() {
  const key = getSetting("api_key");
  return NextResponse.json({ authenticated: !!key });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const valid = await validateApiKey(apiKey);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid DigitalOcean API key" },
      { status: 401 }
    );
  }

  setSetting("api_key", apiKey);

  // Ensure scheduler is initialized after auth
  getScheduler();

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const { getDb } = await import("@/lib/db");
  getDb().prepare("DELETE FROM settings WHERE key = 'api_key'").run();
  return NextResponse.json({ success: true });
}
