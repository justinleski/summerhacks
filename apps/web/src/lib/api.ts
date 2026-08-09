import { useEffect, useState } from "react";
import type {
  MemoryPhoto,
  MemoryPhotoUploadResponse,
} from "@summerhacks/shared";
import { getNeonAccessToken, neonAuthEnabled } from "./neonAuth";

const TOKEN_KEY = "summerhacks.token";
const DEVICE_KEY = "summerhacks.deviceId";
const NAME_KEY = "summerhacks.displayName";
const MODE_KEY = "summerhacks.authMode"; // "neon" | "guest"
const NEEDS_NAME_KEY = "summerhacks.needsName";
const AUTH_CHANGED_EVENT = "summerhacks:auth-changed";

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
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(NEEDS_NAME_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getDisplayName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

/** True when auth succeeded but display name has not been chosen yet. */
export function getNeedsName(): boolean {
  return localStorage.getItem(NEEDS_NAME_KEY) === "1";
}

export function setNeedsName(needs: boolean) {
  if (needs) localStorage.setItem(NEEDS_NAME_KEY, "1");
  else localStorage.removeItem(NEEDS_NAME_KEY);
}

/** Reactive auth check for shared chrome (e.g. StarNav) that persists across route changes. */
export function useIsAuthenticated(): boolean {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  useEffect(() => {
    const update = () => setAuthed(Boolean(getToken()));
    window.addEventListener(AUTH_CHANGED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return authed;
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

export async function uploadCheckinPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{ url: string }>("/uploads/checkin-photo", {
    method: "POST",
    body: form,
  });
  return res.url;
}

export async function uploadMemoryPhoto(
  memoryId: string,
  file: File,
): Promise<MemoryPhoto> {
  const { compressImageForUpload } = await import("./compressImage");
  const compressed = await compressImageForUpload(file);
  const form = new FormData();
  form.append("file", compressed);
  const res = await api<MemoryPhotoUploadResponse>(
    `/memories/${memoryId}/photos`,
    { method: "POST", body: form },
  );
  return res.photo;
}

export async function uploadEventPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api<{ url: string }>("/uploads/event-photo", {
    method: "POST",
    body: form,
  });
  return res.url;
}
