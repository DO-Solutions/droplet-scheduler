"use client";

import { useEffect, useState, useMemo } from "react";
import SchedulePanel from "./SchedulePanel";

type Droplet = {
  id: number;
  name: string;
  ip: string | null;
  region: string;
  regionName: string;
  size: string;
  memory: number;
  vcpus: number;
  disk: number;
  status: string;
  tags: string[];
  imageId: number;
  imageName: string;
  createdAt: string;
};

export default function DropletsView() {
  const [droplets, setDroplets] = useState<Droplet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tagFilter, setTagFilter] = useState<string>("");
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);

  async function fetchDroplets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/droplets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDroplets(data.droplets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch droplets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDroplets();
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    droplets.forEach((d) => d.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [droplets]);

  const visibleDroplets = useMemo(() => {
    if (!tagFilter) return droplets;
    return droplets.filter((d) => d.tags.includes(tagFilter));
  }, [droplets, tagFilter]);

  const allVisibleSelected =
    visibleDroplets.length > 0 &&
    visibleDroplets.every((d) => selected.has(d.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleDroplets.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleDroplets.forEach((d) => next.add(d.id));
        return next;
      });
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedDroplets = droplets.filter((d) => selected.has(d.id));

  function statusBadge(status: string) {
    if (status === "active")
      return <span className="badge-active">{status}</span>;
    if (status === "off")
      return <span className="badge-off">{status}</span>;
    return (
      <span className="badge-pending">{status}</span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Droplets</h1>
          <p className="text-do-muted text-sm mt-0.5">
            {loading ? "Loading..." : `${droplets.length} droplets`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={() => setShowSchedulePanel(true)}
              className="btn-primary text-sm"
            >
              Schedule {selected.size} Droplet{selected.size !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={fetchDroplets} className="btn-secondary text-sm">
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          className="select text-sm"
          value={tagFilter}
          onChange={(e) => {
            setTagFilter(e.target.value);
            setSelected(new Set());
          }}
        >
          <option value="">All tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        {tagFilter && (
          <span className="text-sm text-do-muted">
            Showing {visibleDroplets.length} of {droplets.length} droplets
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-do-blue mx-auto" />
          <p className="text-do-muted mt-3 text-sm">Fetching droplets from DigitalOcean...</p>
        </div>
      ) : visibleDroplets.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-do-muted">No droplets found</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-do-border bg-do-navy">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-do-border accent-do-blue w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-do-muted">Name</th>
                <th className="px-4 py-3 text-left font-medium text-do-muted">IP Address</th>
                <th className="px-4 py-3 text-left font-medium text-do-muted">Region</th>
                <th className="px-4 py-3 text-left font-medium text-do-muted">Size</th>
                <th className="px-4 py-3 text-left font-medium text-do-muted">Status</th>
                <th className="px-4 py-3 text-left font-medium text-do-muted">Tags</th>
              </tr>
            </thead>
            <tbody>
              {visibleDroplets.map((droplet, i) => (
                <tr
                  key={droplet.id}
                  className={`border-b border-do-border last:border-0 hover:bg-do-navy/50 transition-colors cursor-pointer ${
                    selected.has(droplet.id) ? "bg-do-blue/10" : ""
                  } ${i % 2 === 0 ? "" : "bg-do-navy/20"}`}
                  onClick={() => toggleOne(droplet.id)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(droplet.id)}
                      onChange={() => toggleOne(droplet.id)}
                      className="rounded border-do-border accent-do-blue w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{droplet.name}</td>
                  <td className="px-4 py-3 font-mono text-do-muted">
                    {droplet.ip ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-do-muted">{droplet.regionName}</td>
                  <td className="px-4 py-3">
                    <span className="text-do-muted">
                      {droplet.size}{" "}
                      <span className="text-xs">
                        ({droplet.vcpus} vCPU · {droplet.memory / 1024}GB)
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(droplet.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {droplet.tags.length === 0 ? (
                        <span className="text-do-muted">—</span>
                      ) : (
                        droplet.tags.map((tag) => (
                          <span
                            key={tag}
                            className="bg-do-border text-do-text text-xs px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSchedulePanel && selectedDroplets.length > 0 && (
        <SchedulePanel
          droplets={selectedDroplets}
          onClose={() => setShowSchedulePanel(false)}
          onSaved={() => {
            setShowSchedulePanel(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
