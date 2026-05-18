"use client";

import { useEffect, useState } from "react";

export default function SettingsView() {
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTo, setSmtpTo] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [recreateSshKeys, setRecreateSshKeys] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings.default_timezone) setDefaultTimezone(settings.default_timezone);
        if (settings.recreate_ssh_keys) {
          try {
            const keys = JSON.parse(settings.recreate_ssh_keys);
            if (Array.isArray(keys)) {
              setRecreateSshKeys(keys.join(", "));
            }
          } catch {}
        }
        if (settings.smtp_config) {
          try {
            const cfg = JSON.parse(settings.smtp_config);
            setSmtpHost(cfg.host ?? "");
            setSmtpPort(String(cfg.port ?? 587));
            setSmtpSecure(!!cfg.secure);
            setSmtpUser(cfg.user ?? "");
            setSmtpPass(cfg.pass ?? "");
            setSmtpFrom(cfg.from ?? "");
            setSmtpTo(cfg.to ?? "");
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const payload: Record<string, string> = {
      default_timezone: defaultTimezone,
      recreate_ssh_keys: JSON.stringify(
        recreateSshKeys
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      ),
    };

    if (smtpHost) {
      payload.smtp_config = JSON.stringify({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
        to: smtpTo,
      });
    }

    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-do-blue mx-auto" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-do-muted text-sm mt-0.5">Configure email notifications and defaults</p>
      </div>

      {/* Default timezone */}
      <div className="card">
        <h2 className="font-semibold mb-3">Default Timezone</h2>
        <select
          className="select w-full"
          value={defaultTimezone}
          onChange={(e) => setDefaultTimezone(e.target.value)}
        >
          {[
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
          ].map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Email notifications */}
      <div className="card">
        <h2 className="font-semibold mb-1">Recreation SSH Keys</h2>
        <p className="text-do-muted text-sm mb-4">
          Required for recreation. Enter DigitalOcean SSH key IDs or fingerprints, comma-separated.
        </p>
        <input
          className="input"
          placeholder="123456, 789012 or aa:bb:cc:dd:..."
          value={recreateSshKeys}
          onChange={(e) => setRecreateSshKeys(e.target.value)}
        />
      </div>

      {/* Email notifications */}
      <div className="card">
        <h2 className="font-semibold mb-1">Email Notifications</h2>
        <p className="text-do-muted text-sm mb-4">
          Optional. Receive a report email after each recreation cycle.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-do-muted mb-1.5">SMTP Host</label>
              <input
                className="input"
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-do-muted mb-1.5">Port</label>
              <input
                className="input"
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(e) => setSmtpSecure(e.target.checked)}
              className="rounded accent-do-blue w-4 h-4"
            />
            <span className="text-sm">Use TLS/SSL (port 465)</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-do-muted mb-1.5">Username</label>
              <input
                className="input"
                placeholder="your@email.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-do-muted mb-1.5">Password / App Key</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-do-muted mb-1.5">From Address</label>
              <input
                className="input"
                placeholder="scheduler@yourdomain.com"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-do-muted mb-1.5">Send Reports To</label>
              <input
                className="input"
                placeholder="alerts@yourdomain.com"
                value={smtpTo}
                onChange={(e) => setSmtpTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && (
          <span className="text-green-400 text-sm">Settings saved!</span>
        )}
      </div>
    </form>
  );
}
