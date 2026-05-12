"use client";

import { useEffect, useState } from "react";

type Report = {
  id: number;
  event_type: string;
  droplet_id: number;
  droplet_name: string;
  snapshot_do_id: string | null;
  snapshot_name: string | null;
  status: string;
  details: string | null;
  health_check_result: string | null;
  timestamp: number;
};

const EVENT_TYPES = ["", "deletion", "recreation", "snapshot_deletion"];

const EVENT_LABELS: Record<string, string> = {
  deletion: "Deletion",
  recreation: "Recreation",
  snapshot_deletion: "Snapshot Cleanup",
};

export default function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("");
  const [page, setPage] = useState(0);
  const limit = 25;

  async function fetchReports() {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(page * limit),
    });
    if (eventFilter) params.set("type", eventFilter);

    try {
      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();
      setReports(data.reports);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, eventFilter]);

  function statusBadge(status: string) {
    if (status === "success") return <span className="badge-success">Success</span>;
    if (status === "failed") return <span className="badge-failed">Failed</span>;
    if (status === "skipped") return <span className="badge-pending">Skipped</span>;
    return <span className="badge-pending">{status}</span>;
  }

  function eventBadge(type: string) {
    const colors: Record<string, string> = {
      deletion: "bg-red-900 text-red-300",
      recreation: "bg-blue-900 text-blue-300",
      snapshot_deletion: "bg-purple-900 text-purple-300",
    };
    const color = colors[type] ?? "bg-gray-700 text-gray-300";
    return (
      <span className={`${color} text-xs font-medium px-2 py-0.5 rounded-full`}>
        {EVENT_LABELS[type] ?? type}
      </span>
    );
  }

  function healthBadge(result: string | null) {
    if (!result) return <span className="text-do-muted text-xs">—</span>;
    if (result === "pass") return <span className="badge-success">Pass</span>;
    if (result === "fail") return <span className="badge-failed">Fail</span>;
    return <span className="badge-pending">{result}</span>;
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="text-do-muted text-sm mt-0.5">
            {loading ? "Loading..." : `${total} event${total !== 1 ? "s" : ""} logged`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="select text-sm"
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              setPage(0);
            }}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "" ? "All events" : EVENT_LABELS[t] ?? t}
              </option>
            ))}
          </select>
          <button onClick={fetchReports} className="btn-secondary text-sm">
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-do-blue mx-auto" />
        </div>
      ) : reports.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-do-muted">No events logged yet.</p>
          <p className="text-do-muted text-sm mt-1">
            Events will appear here as schedules run.
          </p>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-do-border bg-do-navy">
                  <th className="px-4 py-3 text-left font-medium text-do-muted">Event</th>
                  <th className="px-4 py-3 text-left font-medium text-do-muted">Droplet</th>
                  <th className="px-4 py-3 text-left font-medium text-do-muted">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-do-muted">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-do-muted">Health</th>
                  <th className="px-4 py-3 text-left font-medium text-do-muted">Details</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-b border-do-border last:border-0 ${
                      i % 2 === 0 ? "" : "bg-do-navy/20"
                    }`}
                  >
                    <td className="px-4 py-3">{eventBadge(r.event_type)}</td>
                    <td className="px-4 py-3 font-medium">{r.droplet_name}</td>
                    <td className="px-4 py-3 text-do-muted text-xs">
                      {new Date(r.timestamp * 1000).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3">{healthBadge(r.health_check_result)}</td>
                    <td className="px-4 py-3 text-do-muted text-xs max-w-xs truncate">
                      {r.snapshot_name && (
                        <span className="mr-2 text-purple-300">{r.snapshot_name}</span>
                      )}
                      {r.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-do-muted">
                Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-do-muted">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
