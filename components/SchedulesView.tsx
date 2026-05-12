"use client";

import { useEffect, useState } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ScheduleDroplet = {
  id: number;
  droplet_id: number;
  droplet_name: string;
  region: string;
  size: string;
  state: string;
  last_deleted_at: number | null;
  last_recreated_at: number | null;
};

type Schedule = {
  id: number;
  name: string | null;
  delete_day: number;
  delete_hour: number;
  delete_minute: number;
  recreate_day: number;
  recreate_hour: number;
  recreate_minute: number;
  timezone: string;
  active: number;
  created_at: number;
  droplets: ScheduleDroplet[];
};

export default function SchedulesView() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchSchedules() {
    setLoading(true);
    try {
      const res = await fetch("/api/schedules");
      const data = await res.json();
      setSchedules(data.schedules);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function toggleActive(schedule: Schedule) {
    await fetch(`/api/schedules/${schedule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !schedule.active }),
    });
    fetchSchedules();
  }

  async function deleteSchedule(id: number) {
    if (!confirm("Delete this schedule? This cannot be undone.")) return;
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    fetchSchedules();
  }

  function fmt(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function stateColor(state: string) {
    if (state === "active") return "text-green-400";
    if (state === "deleted") return "text-red-400";
    if (state === "deleting" || state === "recreating") return "text-yellow-400";
    if (state === "error") return "text-red-400";
    return "text-do-muted";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Schedules</h1>
          <p className="text-do-muted text-sm mt-0.5">
            {loading ? "Loading..." : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button onClick={fetchSchedules} className="btn-secondary text-sm">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-do-blue mx-auto" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-do-muted">No schedules yet.</p>
          <p className="text-do-muted text-sm mt-1">
            Select droplets from the Droplets tab to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {schedule.name || `Schedule #${schedule.id}`}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        schedule.active
                          ? "bg-green-900 text-green-300"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {schedule.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="text-do-muted text-xs mt-1">{schedule.timezone}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(schedule)}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    {schedule.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => deleteSchedule(schedule.id)}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-do-navy rounded-lg p-3 border border-do-border">
                  <p className="text-xs text-do-muted mb-1">Deletion</p>
                  <p className="font-medium text-sm text-red-300">
                    {DAYS[schedule.delete_day]} {fmt(schedule.delete_hour, schedule.delete_minute)}
                  </p>
                </div>
                <div className="bg-do-navy rounded-lg p-3 border border-do-border">
                  <p className="text-xs text-do-muted mb-1">Recreation</p>
                  <p className="font-medium text-sm text-green-300">
                    {DAYS[schedule.recreate_day]} {fmt(schedule.recreate_hour, schedule.recreate_minute)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-do-muted mb-2">
                  Droplets ({schedule.droplets.length})
                </p>
                <div className="space-y-1.5">
                  {schedule.droplets.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 bg-do-navy rounded-lg px-3 py-2 text-sm"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        d.state === "active" ? "bg-green-400" :
                        d.state === "deleted" ? "bg-red-400" :
                        d.state === "error" ? "bg-red-500" :
                        "bg-yellow-400"
                      }`} />
                      <span className="font-medium">{d.droplet_name}</span>
                      <span className="text-do-muted">{d.region} · {d.size}</span>
                      <span className={`ml-auto text-xs ${stateColor(d.state)}`}>
                        {d.state}
                      </span>
                      {d.last_deleted_at && (
                        <span className="text-xs text-do-muted">
                          Deleted {new Date(d.last_deleted_at * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
