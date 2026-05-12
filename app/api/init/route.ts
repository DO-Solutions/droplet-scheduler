import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { getScheduler } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasKey = !!(await getSetting("api_key"));
  if (hasKey) {
    getScheduler();
  }
  return NextResponse.json({ initialized: hasKey });
}
