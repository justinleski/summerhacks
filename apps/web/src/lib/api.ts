import { getNeonAccessToken, neonAuthEnabled } from "./neonAuth";

const TOKEN_KEY = "summerhacks.token";
const DEVICE_KEY = "summerhacks.deviceId";
const NAME_KEY = "summerhacks.displayName";
const MODE_KEY = "summerhacks.authMode"; // "neon" | "guest"

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthMode(): "neon" | "guest" | null {
  const mode = localStorage.getItem(MODE_KEY);
  return mode === "neon" || mode === "guest" ? mode : null;
}

export function setAuth(
  token: string,
  displayName: string,
  mode: "neon" | "guest" = "guest",
) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, displayName);
  localStorage.setItem(MODE_KEY, mode);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(MODE_KEY);
}

export function getDisplayName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

async function resolveBearerToken(): Promise<string | null> {
  if (neonAuthEnabled && getAuthMode() === "neon") {
    const jwt = await getNeonAccessToken();
    if (jwt) {
      localStorage.setItem(TOKEN_KEY, jwt);
      return jwt;
    }
  }
  return getToken();
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  const token = await resolveBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function uploadEventImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{ url: string }>("/uploads/event-image", {
    method: "POST",
    body: form,
  });
  return res.url;
}

export async function uploadAvatar(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{ url: string }>("/uploads/avatar", {
    method: "POST",
    body: form,
  });
  return res.url;
}

export async function uploadAlbumCover(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{ url: string }>("/uploads/album-cover", {
    method: "POST",
    body: form,
  });
  return res.url;
}
