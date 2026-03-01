"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Users, Trash2, FolderKanban, Shield, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { toast } from "sonner";
import { useProject, Project } from "@/lib/project-context";

interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
}

interface TeamMember {
  team_id: string;
  username: string;
  role: "admin" | "member";
  joined_at: string;
}

interface ProjectAccess {
  team_id: string;
  project_id: string;
  permission: "read" | "write" | "operate" | "admin";
  granted_by?: string;
  granted_at: string;
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const { isSuperAdmin, projects } = useProject();

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMember, setNewMember] = useState({ username: "", role: "member" });
  const [isAddingMember, setIsAddingMember] = useState(false);

  const [isGrantAccessOpen, setIsGrantAccessOpen] = useState(false);
  const [newAccess, setNewAccess] = useState({ project_id: "", permission: "read" });
  const [isGrantingAccess, setIsGrantingAccess] = useState(false);

  const fetchTeam = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch team");
      const data = await response.json();
      setTeam(data);
    } catch (error) {
      console.error("Failed to fetch team:", error);
      toast.error("Failed to load team");
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch members");
      const data = await response.json();
      setMembers(data || []);
    } catch (error) {
      console.error("Failed to fetch members:", error);
    }
  };

  const fetchProjectAccess = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/projects`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch project access");
      const data = await response.json();
      setProjectAccess(data || []);
    } catch (error) {
      console.error("Failed to fetch project access:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchTeam(), fetchMembers(), fetchProjectAccess()]);
      setIsLoading(false);
    };
    loadData();
  }, [teamId]);

  const handleAddMember = async () => {
    if (!newMember.username.trim()) {
      toast.error("Username is required");
      return;
    }

    setIsAddingMember(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newMember),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add member");
      }

      toast.success("Member added successfully");
      setIsAddMemberOpen(false);
      setNewMember({ username: "", role: "member" });
      fetchMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add member");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (username: string) => {
    if (!confirm(`Remove ${username} from this team?`)) return;

    try {
      const response = await fetch(`/api/teams/${teamId}/members/${username}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to remove member");

      toast.success("Member removed");
      fetchMembers();
    } catch (error) {
      toast.error("Failed to remove member");
    }
  };

  const handleGrantAccess = async () => {
    if (!newAccess.project_id) {
      toast.error("Please select a project");
      return;
    }

    setIsGrantingAccess(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newAccess),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to grant access");
      }

      toast.success("Project access granted");
      setIsGrantAccessOpen(false);
      setNewAccess({ project_id: "", permission: "read" });
      fetchProjectAccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to grant access");
    } finally {
      setIsGrantingAccess(false);
    }
  };

  const handleRevokeAccess = async (projectId: string) => {
    if (!confirm("Revoke this project access?")) return;

    try {
      const response = await fetch(`/api/teams/${teamId}/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to revoke access");

      toast.success("Access revoked");
      fetchProjectAccess();
    } catch (error) {
      toast.error("Failed to revoke access");
    }
  };

  const getProjectName = (projectId: string) => {
    return projects.find((p) => p.id === projectId)?.name || projectId;
  };

  const getPermissionBadge = (permission: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      admin: "destructive",
      operate: "default",
      write: "secondary",
      read: "outline",
    };
    return <Badge variant={variants[permission] || "outline"}>{permission}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg font-medium">Team not found</p>
        <Button variant="link" onClick={() => router.push("/settings/teams")}>
          Go back to teams
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/teams">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "rgb(var(--theme-text))" }}>
            {team.name}
          </h1>
          <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
            @{team.slug}
          </p>
        </div>
      </div>

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            Members ({members.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            <FolderKanban className="mr-2 h-4 w-4" />
            Project Access ({projectAccess.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Manage team members and their roles
            </p>
            {isSuperAdmin && (
              <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                    <DialogDescription>
                      Add a user to this team. They must have an existing account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        placeholder="Enter username"
                        value={newMember.username}
                        onChange={(e) => setNewMember({ ...newMember, username: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={newMember.role}
                        onValueChange={(value) => setNewMember({ ...newMember, role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddMemberOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddMember} disabled={isAddingMember}>
                      {isAddingMember ? "Adding..." : "Add Member"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No members yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {members.map((member) => (
                    <div
                      key={member.username}
                      className="flex items-center justify-between p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {member.username.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{member.username}</p>
                          <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleRemoveMember(member.username)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Control which projects this team can access
            </p>
            {isSuperAdmin && (
              <Dialog open={isGrantAccessOpen} onOpenChange={setIsGrantAccessOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Grant Access
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Grant Project Access</DialogTitle>
                    <DialogDescription>
                      Allow this team to access a project with specific permissions.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="project">Project</Label>
                      <Select
                        value={newAccess.project_id}
                        onValueChange={(value) => setNewAccess({ ...newAccess, project_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects
                            .filter((p) => !projectAccess.find((a) => a.project_id === p.id))
                            .map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="permission">Permission Level</Label>
                      <Select
                        value={newAccess.permission}
                        onValueChange={(value) => setNewAccess({ ...newAccess, permission: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Read - View only</SelectItem>
                          <SelectItem value="write">Write - View and edit configs</SelectItem>
                          <SelectItem value="operate">Operate - Execute commands</SelectItem>
                          <SelectItem value="admin">Admin - Full control</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsGrantAccessOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleGrantAccess} disabled={isGrantingAccess}>
                      {isGrantingAccess ? "Granting..." : "Grant Access"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {projectAccess.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No project access configured</p>
                </div>
              ) : (
                <div className="divide-y">
                  {projectAccess.map((access) => (
                    <div
                      key={access.project_id}
                      className="flex items-center justify-between p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FolderKanban className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{getProjectName(access.project_id)}</p>
                          {getPermissionBadge(access.permission)}
                        </div>
                      </div>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleRevokeAccess(access.project_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
