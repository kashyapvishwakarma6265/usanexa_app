import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, WS_BASE_URL } from "../config";

/**
 * The backend authenticates ONLY with the `usanex_session` cookie
 * (routes/auth.py) and marks it `Secure`. A phone talking to http:// will not
 * keep/send a Secure cookie automatically, so on native we read it from the
 * login response's Set-Cookie header, store it, and send it ourselves as a
 * `Cookie` header on every request and WebSocket. On web the browser handles
 * the cookie (credentials: "include").
 */
const COOKIE_NAME = "usanex_session";
const isWeb = Platform.OS === "web";

const store = {
  get: async (k) => (isWeb ? window.localStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: async (k, v) => (isWeb ? window.localStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k) => (isWeb ? window.localStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

let session = null;
let onUnauthorized = () => {};

export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function loadSession() {
  try { session = await store.get(COOKIE_NAME); } catch { session = null; }
  return session;
}

export async function clearSession() {
  session = null;
  try { await store.del(COOKIE_NAME); } catch {}
}

async function captureCookie(res) {
  if (isWeb) return;
  const raw = res.headers.get("set-cookie");
  if (!raw) return;
  const m = raw.match(new RegExp(`${COOKIE_NAME}=([^;]*)`));
  if (!m) return;
  const value = m[1].replace(/^"|"$/g, "");
  if (!value || /max-age=0(?!\d)/i.test(raw)) return clearSession();
  session = value;
  try { await store.set(COOKIE_NAME, value); } catch {}
}

export const cookieHeader = () => (session ? `${COOKIE_NAME}=${session}` : null);

export function absUrl(u) {
  if (!u) return null;
  return /^https?:/.test(u) ? u : API_BASE_URL + (u.startsWith("/") ? u : "/" + u);
}

function errorText(data, status) {
  const d = data?.detail ?? data?.message;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return `Request failed (${status})`;
}

/**
 * body = JSON object, form = FormData.
 * Resolves with parsed JSON; rejects with Error(message) using FastAPI's `detail`.
 */
export async function api(path, { method = "GET", body, form, signal, silent401 } = {}) {
  if (!session) await loadSession();
  const headers = { Accept: "application/json" };
  const ck = cookieHeader();
  if (ck && !isWeb) headers.Cookie = ck;
  if (session) headers.Authorization = `Bearer ${session}`;
  if (body) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(API_BASE_URL + path, {
      method,
      headers,
      credentials: isWeb ? "include" : "omit",
      body: form || (body ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new Error(`Cannot reach server (${API_BASE_URL}). Check your connection / API URL.`);
  }

  await captureCookie(res);

  let data = {};
  try { data = await res.json(); } catch {}

  // Fallback when the platform hides Set-Cookie: accept the token from the login JSON body
  // (needs the 1-line backend change described in the README).
  if (res.ok && data && typeof data.session_token === "string" && data.session_token) {
    session = data.session_token;
    try { await store.set(COOKIE_NAME, session); } catch {}
  }

  if (res.status === 401 && !silent401) onUnauthorized();
  if (!res.ok) {
    const err = new Error(errorText(data, res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Open a WebSocket to the backend with the session cookie attached. */
export function openSocket(path) {
  let url = WS_BASE_URL + path;

  if (isWeb) {
    // Browser WS API cannot set Cookie header, and cross-origin cookies
    // may be blocked by SameSite. So pass the token as a query param.
    if (session) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}token=${encodeURIComponent(session)}`;
    }
    return new WebSocket(url);
  }

  const ck = cookieHeader();
  // React Native's WebSocket accepts a 3rd `options` argument with headers.
  return new WebSocket(url, undefined, ck ? { headers: { Cookie: ck } } : undefined);
}
