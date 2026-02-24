import { createContext, useContext, useState, useCallback } from "react";

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

  const login = useCallback(async (username, password) => {
    const res = await fetch("http://localhost:8000/api/auth/login/", {
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
    const meRes = await fetch("http://localhost:8000/me/", {
      headers: { Authorization: `Bearer ${data.access}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      localStorage.setItem("user", JSON.stringify(me));
      setUser(me);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setTokens({ access: null, refresh: null });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, tokens, login, logout, isLoggedIn: !!tokens.access }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}