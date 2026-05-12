"use client";

import { useState } from "react";

export default function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Authentication failed");
      } else {
        onAuthenticated();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-do-blue rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-do-text">DO Lifecycle Scheduler</h1>
          <p className="text-do-muted mt-1 text-sm">
            Automate Droplet deletion, snapshotting, and recreation
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Connect your DigitalOcean account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-do-muted mb-1.5">
                Personal Access Token
              </label>
              <input
                type="password"
                className="input"
                placeholder="dop_v1_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-do-muted mt-1.5">
                Generate a token at{" "}
                <span className="text-do-blue">cloud.digitalocean.com → API → Tokens</span>
              </p>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading || !apiKey.trim()}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Validating...
                </>
              ) : (
                "Connect"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-do-muted mt-4">
          Your API key is stored locally on this server and never leaves your environment.
        </p>
      </div>
    </div>
  );
}
