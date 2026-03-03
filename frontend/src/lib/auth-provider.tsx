"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "./api";

interface User {
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  authenticated: boolean;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  authenticated: false,
  logout: async () => { },
  checkAuth: async () => { },
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = async () => {
    try {
      const response = await apiFetch("/api/auth/me");
      const data = await response.json();

      if (data.authenticated && data.user) {
        setUser(data.user);
        setToken(data.token || null);
        setAuthenticated(true);
      } else {
        setUser(null);
        setToken(null);
        setAuthenticated(false);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
      setToken(null);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setToken(null);
      setAuthenticated(false);
      router.push("/login");
    }
  };

  useEffect(() => {
    // Skip auth check on login page
    if (pathname === "/login") {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [pathname]);

  return (
    <AuthContext.Provider value={{ user, token, loading, authenticated, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
