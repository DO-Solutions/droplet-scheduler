"use client";

import { useState } from "react";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

type Droplet = {
  id: number;
  name: string;
  region: string;
  size: string;
  tags: string[];
  imageId: number;
  imageName: string;
};

export default function SchedulePanel({
  droplets,
  onClose,
  onSaved,
}: {
  droplets: Droplet[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [deleteDay, setDeleteDay] = useState(6); // Saturday
  const [deleteHour, setDeleteHour] = useState(23);
  const [deleteMinute, setDeleteMinute] = useState(0);
  const [recreateDay, setRecreateDay] = useState(1); // Monday
  const [recreateHour, setRecreateHour] = useState(6);
  const [recreateMinute, setRecreateMinute] = useState(0);
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function formatTime(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          deleteDay,
          deleteHour,
          deleteMinute,
          recreateDay,
          recreateHour,
          recreateMinute,
          timezone,
          droplets,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-do-card border border-do-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-do-border">
          <div>
            <h2 className="font-semibold text-lg">Create Schedule</h2>
            <p className="text-do-muted text-sm mt-0.5">
              {droplets.length} droplet{droplets.length !== 1 ? "s" : ""} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-do-muted hover:text-do-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Selected droplets */}
          <div>
            <p className="text-sm font-medium text-do-muted mb-2">Selected Droplets</p>
            <div className="space-y-1.5">
              {droplets.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 bg-do-navy rounded-lg px-3 py-2 text-sm"
                >
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="font-medium">{d.name}</span>
                  <span className="text-do-muted ml-auto">{d.region} · {d.size}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule name */}
          <div>
            <label className="block text-sm font-medium text-do-muted mb-1.5">
              Schedule Name (optional)
            </label>
            <input
              className="input"
              placeholder="e.g. Weekend maintenance"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-do-muted mb-1.5">
              Timezone
            </label>
            <select
              className="select w-full"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Deletion schedule */}
          <div className="bg-do-navy rounded-xl p-4 border border-do-border">
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Deletion Schedule
              <span className="text-do-muted text-xs font-normal ml-1">
                (snapshot created before deletion)
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-do-muted mb-1">Day of week</label>
                <select
                  className="select w-full text-sm"
                  value={deleteDay}
                  onChange={(e) => setDeleteDay(parseInt(e.target.value))}
                >
                  {DAYS.map((day, i) => (
                    <option key={day} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-do-muted mb-1">Time</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    className="input text-sm text-center"
                    placeholder="HH"
                    value={deleteHour}
                    onChange={(e) => setDeleteHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                  <span className="text-do-muted self-center">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    className="input text-sm text-center"
                    placeholder="MM"
                    value={deleteMinute}
                    onChange={(e) => setDeleteMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-do-muted mt-2">
              Every {DAYS[deleteDay]} at {formatTime(deleteHour, deleteMinute)} {timezone}
            </p>
          </div>

          {/* Recreation schedule */}
          <div className="bg-do-navy rounded-xl p-4 border border-do-border">
            <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              Recreation Schedule
              <span className="text-do-muted text-xs font-normal ml-1">
                (recreated from snapshot, health checked)
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-do-muted mb-1">Day of week</label>
                <select
                  className="select w-full text-sm"
                  value={recreateDay}
                  onChange={(e) => setRecreateDay(parseInt(e.target.value))}
                >
                  {DAYS.map((day, i) => (
                    <option key={day} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-do-muted mb-1">Time</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    className="input text-sm text-center"
                    placeholder="HH"
                    value={recreateHour}
                    onChange={(e) => setRecreateHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                  <span className="text-do-muted self-center">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    className="input text-sm text-center"
                    placeholder="MM"
                    value={recreateMinute}
                    onChange={(e) => setRecreateMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-do-muted mt-2">
              Every {DAYS[recreateDay]} at {formatTime(recreateHour, recreateMinute)} {timezone}
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                "Save Schedule"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
