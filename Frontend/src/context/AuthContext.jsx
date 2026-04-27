import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { API_BASE } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  const [tokens, setTokens] = useState(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  }));

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setTokens({ access: null, refresh: null });
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setProfile(null);
      return null;
    }
    setProfileLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/me/profile/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearAuthState();
        }
        setProfile(null);
        return null;
      }
      const data = await res.json();
      setProfile(data);
      return data;
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      setProfile(null);
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, [clearAuthState]);

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Invalid credentials");
    }

    const data = await res.json();
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    setTokens({ access: data.access, refresh: data.refresh });

    // Fetch user info
    const meRes = await fetch(`${API_BASE}/me/`, {
      headers: { Authorization: `Bearer ${data.access}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      localStorage.setItem("user", JSON.stringify(me));
      setUser(me);
    }

    // Fetch profile (auto-creates on backend if missing)
    await refreshProfile();
    setAuthChecked(true);
  }, [refreshProfile]);

  const logout = useCallback(() => {
    clearAuthState();
    setAuthChecked(true);
  }, [clearAuthState]);

  // On app mount (or token change), fetch profile once if logged in.
  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      if (tokens.access) {
        await refreshProfile();
      }
      if (mounted) setAuthChecked(true);
    }

    bootstrapAuth();
    return () => {
      mounted = false;
    };
  }, [tokens.access, refreshProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        profile,
        profileLoading,
        authChecked,
        login,
        logout,
        refreshProfile,
        isLoggedIn: !!tokens.access,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
