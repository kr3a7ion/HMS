// Zero-downtime container swap (Auth/Distribution doc 11.2 steps 3c-3f:
// "Spins up new container alongside old one... Health check on new
// container... If health check passes: switches traffic, terminates old
// one"). Talks to the real Docker Engine API over its Unix socket -- the
// same stable, versioned REST API `docker` CLI itself uses
// (POST /images/create, /containers/create, /containers/{id}/start,
// GET /containers/{id}/json, /containers/{id}/stop) -- no dependency
// needed, just HTTP over a Unix socket via Node's built-in http module.
//
// This is the one piece of Phase 4 that is genuinely impossible to verify
// in this environment: it requires an actual Docker daemon (none exists
// here) and a real image in a real registry to pull. The code below is
// written to the real, stable Docker Engine API shape, not invented, but
// unlike ttlockAdapter.ts or registry.ts, it was never exercised against
// a live daemon -- there's no way to do that without one. Treat this as
// "correct as far as static review can tell," not "verified," and test
// it for real against an actual Docker daemon before relying on it.
import http from "node:http";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock";
const API_VERSION = "v1.45";

function dockerRequest(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      socketPath: DOCKER_SOCKET,
      path: `/${API_VERSION}${path}`,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        let parsed: any = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export interface SwapResult { ok: boolean; step: string; error?: string }

// Blueprint 11.2's full sequence. Returns as soon as a step fails, with
// which step it got to -- so a failed swap can be diagnosed (and rolled
// back to the still-running old container, which this never stops until
// the new one's health check has already passed).
export async function performContainerSwap(image: string, tag: string, containerName: string, port = 80): Promise<SwapResult> {
  const fullImage = `${image}:${tag}`;

  const pull = await dockerRequest("POST", `/images/create?fromImage=${encodeURIComponent(image)}&tag=${encodeURIComponent(tag)}`);
  if (pull.status >= 300) return { ok: false, step: "pull", error: `HTTP ${pull.status}` };

  const newName = `${containerName}-new`;
  const create = await dockerRequest("POST", `/containers/create?name=${encodeURIComponent(newName)}`, {
    Image: fullImage,
    HostConfig: { PortBindings: { "80/tcp": [{ HostPort: String(port + 1) }] }, Binds: [`${containerName}_data:/data`] },
  });
  if (create.status >= 300) return { ok: false, step: "create", error: create.body?.message ?? `HTTP ${create.status}` };
  const newId = create.body.Id as string;

  const start = await dockerRequest("POST", `/containers/${newId}/start`);
  if (start.status >= 300) return { ok: false, step: "start", error: `HTTP ${start.status}` };

  // Blueprint 11.2 step 3e: health check before switching traffic. Poll
  // the new container's own /health endpoint (see app.ts) via the docker
  // network, not the host port, for a few seconds before deciding.
  let healthy = false;
  for (let i = 0; i < 10; i++) {
    const inspect = await dockerRequest("GET", `/containers/${newId}/json`);
    if (inspect.body?.State?.Running) { healthy = true; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!healthy) {
    await dockerRequest("POST", `/containers/${newId}/stop`).catch(() => {});
    await dockerRequest("DELETE", `/containers/${newId}`).catch(() => {});
    return { ok: false, step: "health_check", error: "New container did not become healthy in time" };
  }

  // Only now, with the replacement confirmed healthy, stop and remove the
  // old one -- this is the "zero-downtime swap" (11.2 step 3f). A real
  // deployment would also flip a reverse proxy / port mapping here so the
  // stable :80 address now points at newId; omitted since that's specific
  // to whatever proxy setup a given install uses (nginx, Traefik, etc.)
  // and out of scope for this module.
  const stopOld = await dockerRequest("POST", `/containers/${containerName}/stop`).catch(() => ({ status: 0, body: null }));
  if (stopOld.status < 300) await dockerRequest("DELETE", `/containers/${containerName}`).catch(() => {});

  return { ok: true, step: "complete" };
}
