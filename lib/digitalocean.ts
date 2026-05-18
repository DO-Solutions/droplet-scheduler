import axios, { AxiosInstance, AxiosError } from "axios";

const DO_API_BASE = "https://api.digitalocean.com/v2";
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

export type DODroplet = {
  id: number;
  name: string;
  status: string;
  networks: {
    v4: Array<{ ip_address: string; type: string }>;
  };
  region: { slug: string; name: string };
  size: { slug: string; memory: number; vcpus: number; disk: number };
  image: { id: number; name: string; slug: string | null };
  tags: string[];
  created_at: string;
};

export type DOSnapshot = {
  id: string;
  name: string;
  resource_id: string;
  resource_type: string;
  regions: string[];
  created_at: string;
  min_disk_size: number;
  size_gigabytes: number;
};

export type DOAction = {
  id: number;
  status: string;
  type: string;
  started_at: string;
  completed_at: string | null;
  resource_id: number;
  resource_type: string;
};

function createClient(apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: DO_API_BASE,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      // Rate limit or server error — retry with backoff
      if (status === 429 || (status && status >= 500)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        const retryAfter = axiosErr.response?.headers?.["ratelimit-reset"];
        const waitMs = retryAfter
          ? Math.max(parseInt(retryAfter) * 1000 - Date.now(), delay)
          : delay;
        await sleep(Math.min(waitMs, 30000));
        lastError = err as Error;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const client = createClient(apiKey);
    await client.get("/account");
    return true;
  } catch {
    return false;
  }
}

export async function listDroplets(apiKey: string): Promise<DODroplet[]> {
  const client = createClient(apiKey);
  const droplets: DODroplet[] = [];
  let page = 1;

  while (true) {
    const resp = await withRetry(() =>
      client.get("/droplets", { params: { page, per_page: 100 } })
    );
    droplets.push(...resp.data.droplets);
    if (resp.data.links?.pages?.next) {
      page++;
    } else {
      break;
    }
  }

  return droplets;
}

export async function createSnapshot(
  apiKey: string,
  dropletId: number,
  snapshotName: string
): Promise<DOAction> {
  const client = createClient(apiKey);
  const resp = await withRetry(() =>
    client.post(`/droplets/${dropletId}/actions`, {
      type: "snapshot",
      name: snapshotName,
    })
  );
  return resp.data.action;
}

export async function waitForAction(
  apiKey: string,
  dropletId: number,
  actionId: number,
  timeoutMs = 900000 // 15 minutes
): Promise<DOAction> {
  const client = createClient(apiKey);
  const deadline = Date.now() + timeoutMs;
  let pollInterval = 5000;

  while (Date.now() < deadline) {
    const resp = await withRetry(() =>
      client.get(`/droplets/${dropletId}/actions/${actionId}`)
    );
    const action: DOAction = resp.data.action;

    if (action.status === "completed") return action;
    if (action.status === "errored") {
      throw new Error(`Action ${actionId} errored`);
    }

    await sleep(pollInterval);
    pollInterval = Math.min(pollInterval * 1.5, 30000);
  }

  throw new Error(`Action ${actionId} timed out after ${timeoutMs}ms`);
}

export async function getDropletSnapshots(
  apiKey: string,
  dropletId: number
): Promise<DOSnapshot[]> {
  const client = createClient(apiKey);
  const resp = await withRetry(() =>
    client.get(`/droplets/${dropletId}/snapshots`, {
      params: { per_page: 100 },
    })
  );
  return resp.data.snapshots;
}

export async function getSnapshot(
  apiKey: string,
  snapshotId: string
): Promise<DOSnapshot> {
  const client = createClient(apiKey);
  const resp = await withRetry(() => client.get(`/snapshots/${snapshotId}`));
  return resp.data.snapshot;
}

export async function deleteDroplet(
  apiKey: string,
  dropletId: number
): Promise<void> {
  const client = createClient(apiKey);
  await withRetry(() => client.delete(`/droplets/${dropletId}`));
}

export async function createDropletFromSnapshot(
  apiKey: string,
  name: string,
  region: string,
  size: string,
  snapshotId: string,
  tags: string[],
  sshKeys: Array<string | number>
): Promise<DODroplet> {
  const client = createClient(apiKey);
  const payload: {
    name: string;
    region: string;
    size: string;
    image: string;
    tags: string[];
    ssh_keys?: Array<string | number>;
  } = {
    name,
    region,
    size,
    image: snapshotId,
    tags,
  };
  if (sshKeys.length > 0) {
    payload.ssh_keys = sshKeys;
  }
  const resp = await withRetry(() =>
    client.post("/droplets", payload)
  );
  return resp.data.droplet;
}

export async function waitForDropletActive(
  apiKey: string,
  dropletId: number,
  timeoutMs = 600000 // 10 minutes
): Promise<DODroplet> {
  const client = createClient(apiKey);
  const deadline = Date.now() + timeoutMs;
  let pollInterval = 5000;

  while (Date.now() < deadline) {
    const resp = await withRetry(() => client.get(`/droplets/${dropletId}`));
    const droplet: DODroplet = resp.data.droplet;

    if (droplet.status === "active") return droplet;

    await sleep(pollInterval);
    pollInterval = Math.min(pollInterval * 1.5, 15000);
  }

  throw new Error(`Droplet ${dropletId} did not become active within timeout`);
}

export async function deleteSnapshot(
  apiKey: string,
  snapshotId: string
): Promise<void> {
  const client = createClient(apiKey);
  await withRetry(() => client.delete(`/snapshots/${snapshotId}`));
}

export async function getDroplet(
  apiKey: string,
  dropletId: number
): Promise<DODroplet> {
  const client = createClient(apiKey);
  const resp = await withRetry(() => client.get(`/droplets/${dropletId}`));
  return resp.data.droplet;
}
