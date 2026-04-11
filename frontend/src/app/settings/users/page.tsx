"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
    Search,
    Plus,
    MoreHorizontal,
    ShieldCheck,
    UserX,
    UserCheck,
    Pencil,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface UserRecord {
    username: string;
    role: string;
    email: string;
    is_active: boolean;
    last_login?: string;
    is_superadmin: boolean;
    external_id?: string;
    identity_provider: string;
    display_name?: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
}

interface UserFormData {
    username: string;
    password: string;
    role: string;
    email: string;
    display_name: string;
    is_superadmin: boolean;
}

const emptyForm: UserFormData = {
    username: "",
    password: "",
    role: "viewer",
    email: "",
    display_name: "",
    is_superadmin: false,
};

export default function UsersPage() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [editUser, setEditUser] = useState<UserRecord | null>(null);
    const [form, setForm] = useState<UserFormData>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const url = search
                ? `/api/users?search=${encodeURIComponent(search)}`
                : "/api/users";
            const res = await apiFetch(url, { credentials: "include" });
            if (!res.ok) {
                if (res.status === 403) {
                    setUsers([]);
                    return;
                }
                throw new Error("Failed to fetch users");
            }
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to fetch users:", err);
            toast.error("Failed to load users");
        } finally {
            setIsLoading(false);
        }
    }, [search]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const openCreate = () => {
        setForm(emptyForm);
        setEditUser(null);
        setCreateOpen(true);
    };

    const openEdit = (user: UserRecord) => {
        setEditUser(user);
        setForm({
            username: user.username,
            password: "",
            role: user.role,
            email: user.email || "",
            display_name: user.display_name || "",
            is_superadmin: user.is_superadmin,
        });
        setCreateOpen(true);
    };

    const handleSave = async () => {
        if (!editUser && !form.username.trim()) {
            toast.error("Username is required");
            return;
        }
        if (!editUser && form.password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        setIsSaving(true);
        try {
            if (editUser) {
                // Update
                const body: Record<string, unknown> = {
                    role: form.role,
                    email: form.email,
                    display_name: form.display_name,
                    is_superadmin: form.is_superadmin,
                };
                const res = await apiFetch(
                    `/api/users/${encodeURIComponent(editUser.username)}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                    }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || "Failed to update user");
                }
                toast.success("User updated");
            } else {
                // Create
                const res = await apiFetch("/api/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(form),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || "Failed to create user");
                }
                toast.success("User created");
            }
            setCreateOpen(false);
            fetchUsers();
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to save user"
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (user: UserRecord) => {
        const action = user.is_active ? "deactivate" : "reactivate";
        if (
            !confirm(
                `${action === "deactivate" ? "Deactivate" : "Reactivate"} user "${user.username}"?`
            )
        )
            return;
        try {
            const url = user.is_active
                ? `/api/users/${encodeURIComponent(user.username)}`
                : `/api/users/${encodeURIComponent(user.username)}/reactivate`;
            const method = user.is_active ? "DELETE" : "POST";
            const res = await apiFetch(url, { method, credentials: "include" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Failed to ${action} user`);
            }
            toast.success(`User ${action}d`);
            fetchUsers();
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : `Failed to ${action} user`
            );
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "Never";
        try {
            return new Date(dateStr).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2
                        className="text-lg font-semibold"
                        style={{ color: "rgb(var(--theme-text))" }}
                    >
                        Users
                    </h2>
                    <p
                        className="text-sm"
                        style={{ color: "rgb(var(--theme-text-muted))" }}
                    >
                        Manage local and SSO-provisioned users. Assign users to
                        teams to control project and agent visibility.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create user
                </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: "rgb(var(--theme-text-muted))" }}
                />
                <Input
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Users table */}
            <div
                className="rounded-md border"
                style={{ borderColor: "rgb(var(--theme-border))" }}
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last login</TableHead>
                            <TableHead className="w-[50px]" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <span style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        Loading...
                                    </span>
                                </TableCell>
                            </TableRow>
                        ) : users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <Users
                                        className="h-8 w-8 mx-auto mb-2"
                                        style={{
                                            color: "rgb(var(--theme-text-muted))",
                                        }}
                                    />
                                    <p
                                        style={{
                                            color: "rgb(var(--theme-text-muted))",
                                        }}
                                    >
                                        {search
                                            ? "No users match your search"
                                            : "No users found"}
                                    </p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => (
                                <TableRow
                                    key={user.username}
                                    className={
                                        !user.is_active ? "opacity-50" : ""
                                    }
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <div
                                                    className="font-medium flex items-center gap-1.5"
                                                    style={{
                                                        color: "rgb(var(--theme-text))",
                                                    }}
                                                >
                                                    {user.display_name ||
                                                        user.username}
                                                    {user.is_superadmin && (
                                                        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                                                    )}
                                                </div>
                                                <div
                                                    className="text-xs"
                                                    style={{
                                                        color: "rgb(var(--theme-text-muted))",
                                                    }}
                                                >
                                                    {user.username}
                                                    {user.email
                                                        ? ` - ${user.email}`
                                                        : ""}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                user.role === "admin"
                                                    ? "default"
                                                    : "secondary"
                                            }
                                            className="text-xs"
                                        >
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className="text-xs"
                                            style={{
                                                color: "rgb(var(--theme-text-muted))",
                                            }}
                                        >
                                            {user.identity_provider || "local"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                user.is_active
                                                    ? "default"
                                                    : "destructive"
                                            }
                                            className="text-xs"
                                        >
                                            {user.is_active
                                                ? "Active"
                                                : "Inactive"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className="text-xs"
                                            style={{
                                                color: "rgb(var(--theme-text-muted))",
                                            }}
                                        >
                                            {formatDate(user.last_login)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        openEdit(user)
                                                    }
                                                >
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        handleToggleActive(user)
                                                    }
                                                    className={
                                                        user.is_active
                                                            ? "text-red-500 focus:text-red-500"
                                                            : "text-emerald-500 focus:text-emerald-500"
                                                    }
                                                >
                                                    {user.is_active ? (
                                                        <>
                                                            <UserX className="h-4 w-4 mr-2" />
                                                            Deactivate
                                                        </>
                                                    ) : (
                                                        <>
                                                            <UserCheck className="h-4 w-4 mr-2" />
                                                            Reactivate
                                                        </>
                                                    )}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <p
                className="text-xs"
                style={{ color: "rgb(var(--theme-text-muted))" }}
            >
                {users.length} user{users.length !== 1 ? "s" : ""}
                {" | "}
                Assign users to{" "}
                <span className="font-medium">Teams</span> to grant project and
                agent access.
            </p>

            {/* Create / Edit dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editUser ? "Edit user" : "Create user"}
                        </DialogTitle>
                        <DialogDescription>
                            {editUser
                                ? `Update settings for ${editUser.username}`
                                : "Create a new local user account."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {!editUser && (
                            <>
                                <div className="space-y-2">
                                    <Label>Username</Label>
                                    <Input
                                        placeholder="e.g., john.doe"
                                        value={form.username}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                username: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Password</Label>
                                    <Input
                                        type="password"
                                        placeholder="Min 8 characters"
                                        value={form.password}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                password: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </>
                        )}
                        <div className="space-y-2">
                            <Label>Display name</Label>
                            <Input
                                placeholder="John Doe"
                                value={form.display_name}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        display_name: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input
                                type="email"
                                placeholder="john@example.com"
                                value={form.email}
                                onChange={(e) =>
                                    setForm({ ...form, email: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Role</Label>
                            <Select
                                value={form.role}
                                onValueChange={(v) =>
                                    setForm({ ...form, role: v })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="viewer">
                                        Viewer
                                    </SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between rounded-md border p-3" style={{ borderColor: "rgb(var(--theme-border))" }}>
                            <div>
                                <Label className="text-sm font-medium">
                                    Superadmin
                                </Label>
                                <p
                                    className="text-xs"
                                    style={{
                                        color: "rgb(var(--theme-text-muted))",
                                    }}
                                >
                                    Full access to all projects, teams, and
                                    settings.
                                </p>
                            </div>
                            <Switch
                                checked={form.is_superadmin}
                                onCheckedChange={(checked) =>
                                    setForm({
                                        ...form,
                                        is_superadmin: checked,
                                    })
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreateOpen(false)}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving
                                ? "Saving..."
                                : editUser
                                ? "Save changes"
                                : "Create user"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
