import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = [
  "smtp_config",
  "default_timezone",
  "notification_email",
  "recreate_ssh_keys",
];

export async function GET() {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const settings: Record<string, string | null> = {};
  for (const key of ALLOWED_KEYS) {
    const raw = await getSetting(key);
    // Don't expose SMTP password in the response
    if (key === "smtp_config" && raw) {
      try {
        const parsed = JSON.parse(raw);
        settings[key] = JSON.stringify({ ...parsed, pass: "••••••••" });
      } catch {
        settings[key] = null;
      }
    } else {
      settings[key] = raw;
    }
  }

  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (typeof value !== "string") continue;

    // If smtp_config is being updated with masked password, preserve existing password
    if (key === "smtp_config") {
      try {
        const incoming = JSON.parse(value);
        if (incoming.pass === "••••••••") {
          const existing = await getSetting("smtp_config");
          if (existing) {
            const existingParsed = JSON.parse(existing);
            incoming.pass = existingParsed.pass;
          }
        }
        await setSetting(key, JSON.stringify(incoming));
      } catch {
        await setSetting(key, value);
      }
    } else if (key === "recreate_ssh_keys") {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) continue;
        const normalized = parsed
          .map((entry) => {
            if (typeof entry === "number" || typeof entry === "string") {
              return entry;
            }
            return null;
          })
          .filter((entry): entry is string | number => entry !== null);
        await setSetting(key, JSON.stringify(normalized));
      } catch {
        const normalized = value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const numeric = Number(part);
            return Number.isInteger(numeric) ? numeric : part;
          });
        await setSetting(key, JSON.stringify(normalized));
      }
    } else {
      await setSetting(key, value);
    }
  }

  return NextResponse.json({ success: true });
}
