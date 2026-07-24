// Docker Registry HTTP API V2 client (Auth/Distribution doc Part 11.1-11.3).
// Real implementation of the actual spec (distribution.github.io/distribution
// /spec/api) -- GET /v2/<name>/tags/list, and the WWW-Authenticate 401
// challenge -> Bearer token flow real registries use. What's genuinely
// unverifiable in this environment: `registry.nexura.app` (the Blueprint's
// private registry) doesn't exist, so a real deployment would need one
// stood up first. The client itself was tested against a real public
// registry (Docker Hub) to confirm the auth-challenge/bearer-token
// exchange genuinely works before pointing it at a registry that doesn't
// exist -- see ROADMAP.md.
export interface RegistryConfig { url: string; repository: string; username?: string; password?: string }

async function getBearerToken(wwwAuthenticate: string, username?: string, password?: string): Promise<string | null> {
  // Format: Bearer realm="https://auth.example.com/token",service="registry.example.com",scope="repository:name:pull"
  const params: Record<string, string> = {};
  for (const m of wwwAuthenticate.matchAll(/(\w+)="([^"]*)"/g)) params[m[1]] = m[2];
  if (!params.realm) return null;
  const url = new URL(params.realm);
  if (params.service) url.searchParams.set("service", params.service);
  if (params.scope) url.searchParams.set("scope", params.scope);
  const headers: Record<string, string> = {};
  if (username && password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({})) as { token?: string; access_token?: string };
  return body.token ?? body.access_token ?? null;
}

// Real GET /v2/<name>/tags/list against a real registry, following the
// actual 401 WWW-Authenticate -> Bearer token challenge if the registry
// requires it (most do, including Docker Hub and any self-hosted registry
// with token auth configured -- the private-registry norm this Blueprint
// assumes).
export async function listTags(cfg: RegistryConfig): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const base = cfg.url.replace(/\/$/, "");
  const path = `/v2/${cfg.repository}/tags/list`;
  try {
    let res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) {
      const challenge = res.headers.get("www-authenticate");
      if (!challenge) return { ok: false, error: "401 with no WWW-Authenticate challenge" };
      const token = await getBearerToken(challenge, cfg.username, cfg.password);
      if (!token) return { ok: false, error: "Could not obtain bearer token from auth server" };
      res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    }
    if (!res.ok) return { ok: false, error: `Registry returned HTTP ${res.status}` };
    const body = await res.json() as { tags: string[] };
    return { ok: true, tags: body.tags ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Registry unreachable" };
  }
}
