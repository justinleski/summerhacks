/**
 * Same-origin proxy for Neon Managed Better Auth.
 *
 * Mirrors @neondatabase/auth Next.js proxy behavior:
 * - Forward auth API calls to NEON_AUTH_BASE_URL
 * - Rewrite Set-Cookie to first-party (drop Partitioned / upstream Domain)
 * - Pass through set-auth-jwt for the SPA client
 *
 * Without this, Safari / iOS Private treats Neon Auth cookies as third-party
 * and Google OAuth / sessions fail after redirect.
 */

const COOKIE_PREFIX = "__Secure-neon-auth";
const MIDDLEWARE_HEADER = "x-neon-auth-middleware";

const PROXY_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
  "authorization",
  "cookie",
] as const;

const RESPONSE_HEADER_ALLOWLIST = new Set([
  "content-type",
  "content-length",
  "set-auth-jwt",
  "set-auth-token",
  "x-neon-ret-request-id",
]);

export function neonAuthBaseUrl(): string {
  const url = process.env.NEON_AUTH_BASE_URL?.trim();
  if (!url) throw new Error("NEON_AUTH_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

export function neonAuthProxyConfigured(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL?.trim());
}

function extractNeonAuthCookies(cookieHeader: string | undefined): string {
  if (!cookieHeader) return "";
  const parts: string[] = [];
  for (const raw of cookieHeader.split(";")) {
    const piece = raw.trim();
    if (!piece) continue;
    const name = piece.split("=", 1)[0]?.trim() ?? "";
    // Accept both __Secure- prefixed (prod) and rewritten local names.
    if (
      name.startsWith(COOKIE_PREFIX) ||
      name.startsWith("neon-auth.") ||
      name.startsWith("__Secure-neon-auth.")
    ) {
      // Upstream always expects __Secure-neon-auth.* on HTTPS Neon.
      if (name.startsWith("neon-auth.")) {
        const value = piece.slice(piece.indexOf("="));
        parts.push(`${COOKIE_PREFIX}.${name.slice("neon-auth.".length)}${value}`);
      } else {
        parts.push(piece);
      }
    }
  }
  return parts.join("; ");
}

function requestOrigin(request: Request): string {
  return (
    request.headers.get("origin") ||
    request.headers.get("referer")?.split("/").slice(0, 3).join("/") ||
    new URL(request.url).origin
  );
}

function prepareUpstreamHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of PROXY_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Origin", requestOrigin(request));
  headers.set("Cookie", extractNeonAuthCookies(request.headers.get("cookie") ?? undefined));
  headers.set(MIDDLEWARE_HEADER, "true");
  return headers;
}

type ParsedCookie = {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

/** Parse one Set-Cookie header line into attributes we care about. */
function parseSetCookie(line: string): ParsedCookie | null {
  const segments = line.split(";").map((s) => s.trim());
  const [nameValue, ...attrs] = segments;
  if (!nameValue) return null;
  const eq = nameValue.indexOf("=");
  if (eq <= 0) return null;
  const name = nameValue.slice(0, eq).trim();
  const value = nameValue.slice(eq + 1).trim();
  const cookie: ParsedCookie = {
    name,
    value,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };
  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower === "httponly") cookie.httpOnly = true;
    else if (lower === "secure") cookie.secure = true;
    else if (lower.startsWith("path=")) cookie.path = attr.slice(5);
    else if (lower.startsWith("max-age=")) {
      const n = Number(attr.slice(8));
      if (Number.isFinite(n)) cookie.maxAge = n;
    } else if (lower.startsWith("samesite=")) {
      const v = attr.slice(9).toLowerCase();
      if (v === "strict") cookie.sameSite = "Strict";
      else if (v === "none") cookie.sameSite = "None";
      else cookie.sameSite = "Lax";
    }
    // Drop Domain and Partitioned — first-party on the app host.
  }
  return cookie;
}

function serializeSetCookie(cookie: ParsedCookie): string {
  let out = `${cookie.name}=${cookie.value}`;
  out += `; Path=${cookie.path || "/"}`;
  if (cookie.maxAge !== undefined) out += `; Max-Age=${cookie.maxAge}`;
  if (cookie.httpOnly) out += "; HttpOnly";
  // Always Secure on HTTPS deployments; localhost http still works without it
  // for local Vite proxy, but Neon cookies are marked Secure upstream.
  if (cookie.secure) out += "; Secure";
  out += `; SameSite=${cookie.sameSite}`;
  return out;
}

function rewriteSetCookieHeaders(
  upstream: Headers,
  opts: { https: boolean },
): string[] {
  const raw = typeof upstream.getSetCookie === "function" ? upstream.getSetCookie() : [];
  const lines =
    raw.length > 0
      ? raw
      : upstream.get("set-cookie")
        ? [upstream.get("set-cookie")!]
        : [];
  const rewritten: string[] = [];
  for (const line of lines) {
    const parsed = parseSetCookie(line);
    if (!parsed) continue;
    parsed.sameSite = "Lax";
    if (!opts.https) {
      // __Secure- prefix requires Secure; drop prefix on local http.
      if (parsed.name.startsWith("__Secure-")) {
        parsed.name = parsed.name.slice("__Secure-".length);
      }
      parsed.secure = false;
    } else {
      parsed.secure = true;
    }
    rewritten.push(serializeSetCookie(parsed));
  }
  return rewritten;
}

function requestIsHttps(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  const proto = request.headers.get("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

/**
 * Proxy one auth request. `path` is the suffix after `/api/auth/`
 * (e.g. `get-session`, `sign-in/email`, `sign-in/social`).
 */
export async function proxyNeonAuthRequest(
  request: Request,
  path: string,
): Promise<Response> {
  const base = neonAuthBaseUrl();
  const incoming = new URL(request.url);
  const upstreamUrl = new URL(`${base}/${path.replace(/^\//, "")}`);
  upstreamUrl.search = incoming.search;

  const method = request.method.toUpperCase();
  const headers = prepareUpstreamHeaders(request);
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(upstreamUrl, init);
  const outHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (RESPONSE_HEADER_ALLOWLIST.has(key.toLowerCase())) {
      outHeaders.set(key, value);
    }
  }
  const https = requestIsHttps(request);
  for (const cookie of rewriteSetCookieHeaders(upstream.headers, { https })) {
    outHeaders.append("Set-Cookie", cookie);
  }

  const location = upstream.headers.get("location");
  if (location) outHeaders.set("Location", location);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
