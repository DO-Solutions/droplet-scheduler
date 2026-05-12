import { NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import { listDroplets } from "@/lib/digitalocean";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = await getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const droplets = await listDroplets(apiKey);

    // Update cache
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    for (const d of droplets) {
      const publicIp =
        d.networks.v4.find((n) => n.type === "public")?.ip_address ?? null;
      await db.run(
        `INSERT INTO droplet_cache (id, name, ip, region, size, status, tags, image_id, image_name, cached_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(id) DO UPDATE SET
           name=EXCLUDED.name, ip=EXCLUDED.ip, region=EXCLUDED.region,
           size=EXCLUDED.size, status=EXCLUDED.status, tags=EXCLUDED.tags,
           image_id=EXCLUDED.image_id, image_name=EXCLUDED.image_name, cached_at=EXCLUDED.cached_at`,
        [
          d.id,
          d.name,
          publicIp,
          d.region.slug,
          d.size.slug,
          d.status,
          JSON.stringify(d.tags),
          d.image.id,
          d.image.name,
          now,
        ]
      );
    }

    const formatted = droplets.map((d) => ({
      id: d.id,
      name: d.name,
      ip: d.networks.v4.find((n) => n.type === "public")?.ip_address ?? null,
      region: d.region.slug,
      regionName: d.region.name,
      size: d.size.slug,
      memory: d.size.memory,
      vcpus: d.size.vcpus,
      disk: d.size.disk,
      status: d.status,
      tags: d.tags,
      imageId: d.image.id,
      imageName: d.image.name,
      createdAt: d.created_at,
    }));

    return NextResponse.json({ droplets: formatted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
