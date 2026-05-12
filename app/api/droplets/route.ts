import { NextResponse } from "next/server";
import { getSetting, getDb } from "@/lib/db";
import { listDroplets } from "@/lib/digitalocean";

export async function GET() {
  const apiKey = getSetting("api_key");
  if (!apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const droplets = await listDroplets(apiKey);

    // Update cache
    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO droplet_cache (id, name, ip, region, size, status, tags, image_id, image_name, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, ip = excluded.ip, region = excluded.region,
         size = excluded.size, status = excluded.status, tags = excluded.tags,
         image_id = excluded.image_id, image_name = excluded.image_name,
         cached_at = excluded.cached_at`
    );

    const insertMany = db.transaction((drops: typeof droplets) => {
      for (const d of drops) {
        const publicIp =
          d.networks.v4.find((n) => n.type === "public")?.ip_address ?? null;
        upsert.run(
          d.id,
          d.name,
          publicIp,
          d.region.slug,
          d.size.slug,
          d.status,
          JSON.stringify(d.tags),
          d.image.id,
          d.image.name
        );
      }
    });

    insertMany(droplets);

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
