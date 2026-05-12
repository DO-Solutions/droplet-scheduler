import cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import { getDb, getSetting, setSetting, addReport } from "./db";
import type { Schedule, ScheduleDroplet, Snapshot } from "./db";
import {
  createSnapshot,
  waitForAction,
  deleteDroplet,
  getDropletSnapshots,
  createDropletFromSnapshot,
  waitForDropletActive,
  deleteSnapshot,
  getDroplet,
} from "./digitalocean";
import { sendReportEmail } from "./mailer";
import type { Report } from "./db";

const execAsync = promisify(exec);

// Day mapping: 0=Sunday, 1=Monday, ..., 6=Saturday
// node-cron: 0=Sunday, 1=Monday, ..., 6=Saturday

declare global {
  // eslint-disable-next-line no-var
  var __schedulerInstance: LifecycleScheduler | undefined;
}

export class LifecycleScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  initialize() {
    console.log("[Scheduler] Initializing...");
    this.loadAllSchedules();
    this.startSnapshotCleanupPoller();
    console.log("[Scheduler] Ready");
  }

  private loadAllSchedules() {
    const db = getDb();
    const schedules = db
      .prepare("SELECT * FROM schedules WHERE active = 1")
      .all() as Schedule[];

    for (const schedule of schedules) {
      this.registerSchedule(schedule);
    }

    console.log(`[Scheduler] Loaded ${schedules.length} active schedules`);
  }

  registerSchedule(schedule: Schedule) {
    this.unregisterSchedule(schedule.id);

    const deleteCron = this.buildCronExpression(
      schedule.delete_minute,
      schedule.delete_hour,
      schedule.delete_day
    );
    const recreateCron = this.buildCronExpression(
      schedule.recreate_minute,
      schedule.recreate_hour,
      schedule.recreate_day
    );

    const deleteJob = cron.schedule(
      deleteCron,
      () => this.runDeletionWorkflow(schedule.id),
      { timezone: schedule.timezone }
    );

    const recreateJob = cron.schedule(
      recreateCron,
      () => this.runRecreationWorkflow(schedule.id),
      { timezone: schedule.timezone }
    );

    this.jobs.set(`delete-${schedule.id}`, deleteJob);
    this.jobs.set(`recreate-${schedule.id}`, recreateJob);

    console.log(
      `[Scheduler] Registered schedule ${schedule.id}: delete=${deleteCron}, recreate=${recreateCron} (tz=${schedule.timezone})`
    );
  }

  unregisterSchedule(scheduleId: number) {
    const deleteKey = `delete-${scheduleId}`;
    const recreateKey = `recreate-${scheduleId}`;

    const deleteJob = this.jobs.get(deleteKey);
    if (deleteJob) {
      deleteJob.stop();
      this.jobs.delete(deleteKey);
    }

    const recreateJob = this.jobs.get(recreateKey);
    if (recreateJob) {
      recreateJob.stop();
      this.jobs.delete(recreateKey);
    }
  }

  private buildCronExpression(
    minute: number,
    hour: number,
    day: number
  ): string {
    // cron: second minute hour day-of-month month day-of-week
    return `0 ${minute} ${hour} * * ${day}`;
  }

  async runDeletionWorkflow(scheduleId: number) {
    const db = getDb();
    const schedule = db
      .prepare("SELECT * FROM schedules WHERE id = ?")
      .get(scheduleId) as Schedule | undefined;
    if (!schedule || !schedule.active) return;

    const apiKey = getSetting("api_key");
    if (!apiKey) {
      console.error("[Scheduler] No API key configured");
      return;
    }

    const droplets = db
      .prepare("SELECT * FROM schedule_droplets WHERE schedule_id = ?")
      .all(scheduleId) as ScheduleDroplet[];

    console.log(
      `[Scheduler] Running deletion workflow for schedule ${scheduleId}, ${droplets.length} droplets`
    );

    for (const sd of droplets) {
      await this.deleteSingleDroplet(apiKey, sd, scheduleId);
    }
  }

  private async deleteSingleDroplet(
    apiKey: string,
    sd: ScheduleDroplet,
    scheduleId: number
  ) {
    const db = getDb();
    console.log(
      `[Scheduler] Deleting droplet ${sd.droplet_name} (${sd.droplet_id})`
    );

    db.prepare(
      "UPDATE schedule_droplets SET state = 'deleting' WHERE id = ?"
    ).run(sd.id);

    try {
      // Verify droplet still exists
      let dropletData;
      try {
        dropletData = await getDroplet(apiKey, sd.droplet_id);
      } catch {
        // Droplet might already be gone
        addReport({
          event_type: "deletion",
          droplet_id: sd.droplet_id,
          droplet_name: sd.droplet_name,
          snapshot_do_id: null,
          snapshot_name: null,
          schedule_id: scheduleId,
          status: "skipped",
          details: "Droplet not found — may have already been deleted",
          health_check_result: null,
        });
        db.prepare(
          "UPDATE schedule_droplets SET state = 'idle' WHERE id = ?"
        ).run(sd.id);
        return;
      }

      // Step 1: Create snapshot
      const snapshotName = `${sd.droplet_name}-snap-${Date.now()}`;
      console.log(`[Scheduler] Creating snapshot: ${snapshotName}`);
      const action = await createSnapshot(
        apiKey,
        sd.droplet_id,
        snapshotName
      );

      // Step 2: Wait for snapshot to complete
      await waitForAction(apiKey, sd.droplet_id, action.id);
      console.log(`[Scheduler] Snapshot action completed for ${sd.droplet_name}`);

      // Fetch the new snapshot ID from DO
      const doSnapshots = await getDropletSnapshots(apiKey, sd.droplet_id);
      const newSnapshot = doSnapshots.find((s) => s.name === snapshotName);

      let snapshotDoId = newSnapshot?.id ?? "";
      if (!newSnapshot) {
        // Fallback: take the most recent snapshot
        const sorted = doSnapshots.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        if (sorted.length > 0) {
          snapshotDoId = sorted[0].id;
        }
      }

      if (!snapshotDoId) {
        throw new Error("Could not find created snapshot");
      }

      // Step 3: Save snapshot metadata
      db.prepare(
        `INSERT INTO snapshots (droplet_id, droplet_name, snapshot_do_id, snapshot_name, region, size)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        sd.droplet_id,
        sd.droplet_name,
        snapshotDoId,
        snapshotName,
        dropletData.region.slug,
        dropletData.size.slug
      );

      db.prepare(
        "UPDATE schedule_droplets SET current_snapshot_id = ? WHERE id = ?"
      ).run(snapshotDoId, sd.id);

      // Step 4: Delete the droplet
      console.log(`[Scheduler] Deleting droplet ${sd.droplet_name}`);
      await deleteDroplet(apiKey, sd.droplet_id);

      // Step 5: Log success
      db.prepare(
        "UPDATE schedule_droplets SET state = 'deleted', last_deleted_at = unixepoch() WHERE id = ?"
      ).run(sd.id);

      const reportId = addReport({
        event_type: "deletion",
        droplet_id: sd.droplet_id,
        droplet_name: sd.droplet_name,
        snapshot_do_id: snapshotDoId,
        snapshot_name: snapshotName,
        schedule_id: scheduleId,
        status: "success",
        details: `Snapshot ${snapshotName} created and droplet deleted`,
        health_check_result: null,
      });

      console.log(
        `[Scheduler] Deletion complete for ${sd.droplet_name}, report #${reportId}`
      );

      await this.maybeSendEmail([
        db
          .prepare("SELECT * FROM reports WHERE id = ?")
          .get(reportId) as Report,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[Scheduler] Deletion failed for ${sd.droplet_name}: ${msg}`
      );

      db.prepare(
        "UPDATE schedule_droplets SET state = 'error' WHERE id = ?"
      ).run(sd.id);

      addReport({
        event_type: "deletion",
        droplet_id: sd.droplet_id,
        droplet_name: sd.droplet_name,
        snapshot_do_id: null,
        snapshot_name: null,
        schedule_id: scheduleId,
        status: "failed",
        details: msg,
        health_check_result: null,
      });
    }
  }

  async runRecreationWorkflow(scheduleId: number) {
    const db = getDb();
    const schedule = db
      .prepare("SELECT * FROM schedules WHERE id = ?")
      .get(scheduleId) as Schedule | undefined;
    if (!schedule || !schedule.active) return;

    const apiKey = getSetting("api_key");
    if (!apiKey) return;

    const droplets = db
      .prepare("SELECT * FROM schedule_droplets WHERE schedule_id = ?")
      .all(scheduleId) as ScheduleDroplet[];

    console.log(
      `[Scheduler] Running recreation workflow for schedule ${scheduleId}, ${droplets.length} droplets`
    );

    const cycleReports: Report[] = [];

    for (const sd of droplets) {
      const report = await this.recreateSingleDroplet(
        apiKey,
        sd,
        scheduleId
      );
      if (report) cycleReports.push(report);
    }

    if (cycleReports.length > 0) {
      const successful = cycleReports.filter((r) => r.status === "success").length;
      await this.maybeSendEmail(
        cycleReports,
        `Recreation Cycle Complete: ${successful}/${cycleReports.length} succeeded`
      );
    }
  }

  private async recreateSingleDroplet(
    apiKey: string,
    sd: ScheduleDroplet,
    scheduleId: number
  ): Promise<Report | null> {
    const db = getDb();
    console.log(
      `[Scheduler] Recreating droplet ${sd.droplet_name} from snapshot`
    );

    db.prepare(
      "UPDATE schedule_droplets SET state = 'recreating' WHERE id = ?"
    ).run(sd.id);

    try {
      // Step 1: Find latest snapshot
      const snapshot = db
        .prepare(
          "SELECT * FROM snapshots WHERE droplet_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 1"
        )
        .get(sd.droplet_id) as Snapshot | undefined;

      if (!snapshot) {
        throw new Error(
          `No snapshot found for droplet ${sd.droplet_name} (${sd.droplet_id})`
        );
      }

      // Step 2: Recreate droplet from snapshot
      const tags = JSON.parse(sd.tags || "[]") as string[];
      console.log(
        `[Scheduler] Creating droplet ${sd.droplet_name} from snapshot ${snapshot.snapshot_do_id}`
      );

      const newDroplet = await createDropletFromSnapshot(
        apiKey,
        sd.droplet_name,
        snapshot.region,
        snapshot.size,
        snapshot.snapshot_do_id,
        tags
      );

      // Step 3: Wait for active
      console.log(
        `[Scheduler] Waiting for droplet ${newDroplet.id} to become active`
      );
      const activeDroplet = await waitForDropletActive(apiKey, newDroplet.id);

      const publicIp =
        activeDroplet.networks.v4.find((n) => n.type === "public")
          ?.ip_address ?? null;

      // Step 4: Update the droplet reference in schedule_droplets
      db.prepare(
        `UPDATE schedule_droplets
         SET droplet_id = ?, state = 'active', last_recreated_at = unixepoch()
         WHERE id = ?`
      ).run(activeDroplet.id, sd.id);

      // Step 5: Health check
      let healthResult = "unknown";
      if (publicIp) {
        healthResult = await this.performHealthCheck(publicIp);
      }

      const success = healthResult === "pass";

      // Step 6: Log report
      const reportId = addReport({
        event_type: "recreation",
        droplet_id: activeDroplet.id,
        droplet_name: sd.droplet_name,
        snapshot_do_id: snapshot.snapshot_do_id,
        snapshot_name: snapshot.snapshot_name,
        schedule_id: scheduleId,
        status: success ? "success" : "failed",
        details: `Recreated from snapshot ${snapshot.snapshot_name}, IP: ${publicIp ?? "unknown"}`,
        health_check_result: healthResult,
      });

      // Step 7: Schedule snapshot deletion in 2 hours if success
      if (success) {
        const deleteAfter = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        db.prepare(
          "UPDATE snapshots SET delete_after = ? WHERE id = ?"
        ).run(deleteAfter, snapshot.id);

        console.log(
          `[Scheduler] Snapshot ${snapshot.snapshot_do_id} scheduled for deletion at ${new Date(deleteAfter * 1000).toISOString()}`
        );
      } else {
        // Flag snapshot for manual review
        db.prepare(
          "UPDATE snapshots SET delete_after = NULL WHERE id = ?"
        ).run(snapshot.id);
        console.warn(
          `[Scheduler] Health check failed for ${sd.droplet_name}, snapshot retained for manual review`
        );
      }

      const report = db
        .prepare("SELECT * FROM reports WHERE id = ?")
        .get(reportId) as Report;

      console.log(
        `[Scheduler] Recreation ${success ? "succeeded" : "failed"} for ${sd.droplet_name}, health=${healthResult}`
      );

      return report;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[Scheduler] Recreation failed for ${sd.droplet_name}: ${msg}`
      );

      db.prepare(
        "UPDATE schedule_droplets SET state = 'error' WHERE id = ?"
      ).run(sd.id);

      addReport({
        event_type: "recreation",
        droplet_id: sd.droplet_id,
        droplet_name: sd.droplet_name,
        snapshot_do_id: null,
        snapshot_name: null,
        schedule_id: scheduleId,
        status: "failed",
        details: msg,
        health_check_result: null,
      });

      return null;
    }
  }

  private async performHealthCheck(ip: string): Promise<string> {
    // Try ICMP ping first, then HTTP
    try {
      const pingResult = await this.pingHost(ip);
      if (pingResult) return "pass";
    } catch {
      // ignore ping failure, try HTTP
    }

    try {
      const httpResult = await this.httpCheck(ip);
      if (httpResult) return "pass";
    } catch {
      // both failed
    }

    return "fail";
  }

  private async pingHost(ip: string): Promise<boolean> {
    try {
      // -c 3: send 3 packets, -W 5: 5 second timeout
      await execAsync(`ping -c 3 -W 5 ${ip}`);
      return true;
    } catch {
      return false;
    }
  }

  private async httpCheck(ip: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 10000);

      // Dynamic import to avoid issues at module load
      import("http")
        .then(({ default: http }) => {
          const req = http.get(
            { hostname: ip, port: 80, path: "/", timeout: 8000 },
            () => {
              clearTimeout(timeout);
              resolve(true);
            }
          );
          req.on("error", () => {
            clearTimeout(timeout);
            resolve(false);
          });
          req.on("timeout", () => {
            req.destroy();
            clearTimeout(timeout);
            resolve(false);
          });
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }

  // Polls every 5 minutes to delete snapshots whose delete_after time has passed
  private startSnapshotCleanupPoller() {
    cron.schedule("*/5 * * * *", () => this.cleanupPendingSnapshots());
  }

  private async cleanupPendingSnapshots() {
    const db = getDb();
    const apiKey = getSetting("api_key");
    if (!apiKey) return;

    const now = Math.floor(Date.now() / 1000);
    const pending = db
      .prepare(
        "SELECT * FROM snapshots WHERE deleted = 0 AND delete_after IS NOT NULL AND delete_after <= ?"
      )
      .all(now) as Snapshot[];

    for (const snap of pending) {
      try {
        await deleteSnapshot(apiKey, snap.snapshot_do_id);
        db.prepare(
          "UPDATE snapshots SET deleted = 1 WHERE id = ?"
        ).run(snap.id);

        addReport({
          event_type: "snapshot_deletion",
          droplet_id: snap.droplet_id,
          droplet_name: snap.droplet_name,
          snapshot_do_id: snap.snapshot_do_id,
          snapshot_name: snap.snapshot_name,
          schedule_id: null,
          status: "success",
          details: "Automatic snapshot cleanup after successful recreation",
          health_check_result: null,
        });

        console.log(`[Scheduler] Deleted snapshot ${snap.snapshot_do_id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[Scheduler] Failed to delete snapshot ${snap.snapshot_do_id}: ${msg}`
        );
      }
    }
  }

  private async maybeSendEmail(reports: Report[], subject?: string) {
    const smtpConfig = getSetting("smtp_config");
    if (!smtpConfig) return;
    try {
      await sendReportEmail(
        reports,
        subject ?? `DO Scheduler: ${reports[0]?.event_type} report`
      );
    } catch (err) {
      console.error("[Scheduler] Email send failed:", err);
    }
  }
}

export function getScheduler(): LifecycleScheduler {
  if (!global.__schedulerInstance) {
    global.__schedulerInstance = new LifecycleScheduler();
    global.__schedulerInstance.initialize();
  }
  return global.__schedulerInstance;
}
