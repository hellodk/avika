"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { apiFetch } from "./api";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
  updated_at: string;
  environments?: Environment[];
}

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description?: string;
  color: string;
  sort_order: number;
  is_production: boolean;
  created_at: string;
  updated_at: string;
}

interface ProjectContextType {
  projects: Project[];
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
  isLoading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  selectProject: (project: Project | null) => void;
  selectEnvironment: (environment: Environment | null) => void;
  refreshProjects: () => Promise<void>;
  refreshEnvironments: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await apiFetch("/api/projects", {
        credentials: "include",
      });
      if (!response.ok) {
        setProjects([]);
        setError(response.status === 401 ? null : "Failed to fetch projects");
        return;
      }
      const data = await response.json();
      setProjects(data || []);
      setError(null);

      // Try to restore selected project from localStorage
      const savedProjectId = localStorage.getItem("selectedProjectId");
      if (savedProjectId && data?.length > 0) {
        const savedProject = data.find((p: Project) => p.id === savedProjectId);
        if (savedProject) {
          setSelectedProject(savedProject);
        }
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      setProjects([]);
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
    }
  }, []);

  const fetchEnvironments = useCallback(async () => {
    if (!selectedProject) {
      setEnvironments([]);
      setSelectedEnvironment(null);
      return;
    }
    
    try {
      const response = await apiFetch(`/api/projects/${selectedProject.id}/environments`, {
        credentials: "include",
      });
      if (!response.ok) {
        setEnvironments([]);
        setSelectedEnvironment(null);
        return;
      }
      const data = await response.json();
      setEnvironments(data || []);
      
      // Try to restore selected environment from localStorage
      const savedEnvId = localStorage.getItem("selectedEnvironmentId");
      if (savedEnvId && data?.length > 0) {
        const savedEnv = data.find((e: Environment) => e.id === savedEnvId);
        if (savedEnv) {
          setSelectedEnvironment(savedEnv);
          return;
        }
      }
      
      // Default to first environment (usually production)
      if (data?.length > 0) {
        setSelectedEnvironment(data[0]);
        localStorage.setItem("selectedEnvironmentId", data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch environments:", err);
    }
  }, [selectedProject]);

  const fetchUserInfo = useCallback(async () => {
    try {
      const response = await apiFetch("/api/auth/me", {
        credentials: "include",
      });
      if (!response.ok) {
        // Server-side error (5xx) — keep state at defaults; the user can retry.
        console.error("fetchUserInfo: /api/auth/me returned", response.status);
        return;
      }
      const data = await response.json();
      // The backend returns {authenticated: false} when the cookie is invalid
      // (e.g. after a gateway pod restart wiped the in-memory token cache).
      // The browser still has the cookie but the server doesn't recognize it.
      // Treat this as a hard logout: clear the cookie and bounce to /login.
      if (data?.authenticated === false) {
        if (typeof window !== "undefined") {
          // Don't redirect if already on login page (avoid loops).
          const loginPaths = ["/login", "/change-password"];
          const onLoginPage = loginPaths.some((p) =>
            window.location.pathname.endsWith(p)
          );
          if (!onLoginPage) {
            // Clear stale session cookie so the middleware doesn't see it.
            document.cookie = "avika_session=; Max-Age=0; path=/";
            const redirect = encodeURIComponent(
              window.location.pathname + window.location.search
            );
            window.location.href = `/avika/login?redirect=${redirect}`;
          }
        }
        return;
      }
      setIsSuperAdmin(data.is_superadmin || false);
    } catch (err) {
      // Network error / parse error — log so it doesn't go silent.
      console.error("fetchUserInfo: failed", err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchProjects(), fetchUserInfo()]);
      setIsLoading(false);
    };
    init();
  }, [fetchProjects, fetchUserInfo]);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const selectProject = useCallback((project: Project | null) => {
    setSelectedProject(project);
    setSelectedEnvironment(null);
    if (project) {
      localStorage.setItem("selectedProjectId", project.id);
    } else {
      localStorage.removeItem("selectedProjectId");
    }
    localStorage.removeItem("selectedEnvironmentId");
  }, []);

  const selectEnvironment = useCallback((environment: Environment | null) => {
    setSelectedEnvironment(environment);
    if (environment) {
      localStorage.setItem("selectedEnvironmentId", environment.id);
    } else {
      localStorage.removeItem("selectedEnvironmentId");
    }
  }, []);

  const value: ProjectContextType = {
    projects,
    selectedProject,
    selectedEnvironment,
    environments,
    isLoading,
    error,
    isSuperAdmin,
    selectProject,
    selectEnvironment,
    refreshProjects: fetchProjects,
    refreshEnvironments: fetchEnvironments,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
