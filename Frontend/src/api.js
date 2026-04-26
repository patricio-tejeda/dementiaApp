export const API_BASE = "http://localhost:8000";

/**
 * Authenticated fetch wrapper.
 * Automatically attaches the JWT access token from localStorage.
 * On 401, clears the token so AuthContext notices and redirects to login.
 */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token expired or invalid — force a clean logout
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    // Reload so AuthContext re-reads localStorage and shows login screen
    window.location.reload();
    // Return never-resolving promise so callers don't try to parse
    return new Promise(() => {});
  }

  return res;
}