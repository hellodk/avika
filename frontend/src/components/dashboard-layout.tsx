"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Activity, BarChart2, Server, Settings, ShieldAlert, Zap,
    FileText, Heart, Cpu, ChevronDown, ChevronRight,
    Search, Bell, User, Menu, X, HelpCircle, LogOut,
    LayoutDashboard, Layers, GitBranch, Terminal, BookOpen, KeyRound, Globe,
    LineChart, Users, FolderKanban, Lock, Info
} from "lucide-react";
import { ProjectSelector } from "@/components/project-selector";
import { EnvironmentTabs } from "@/components/environment-tabs";
import { useProject } from "@/lib/project-context";
import { Breadcrumb } from "@/components/breadcrumb";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-provider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavSection {
    title: string;
    items: NavItem[];
}

interface NavItem {
    href: string;
    icon: ReactNode;
    label: string;
    badge?: string;
    badgeColor?: string;
}

const NAV_SECTIONS: NavSection[] = [
    {
        title: "Overview",
        items: [
            { href: "/", icon: <LayoutDashboard />, label: "Dashboard" },
            { href: "/system", icon: <Heart />, label: "System Health" },
            { href: "/monitoring", icon: <Cpu />, label: "Monitoring" },
        ]
    },
    {
        title: "Infrastructure",
        items: [
            { href: "/inventory", icon: <Server />, label: "Inventory" },
            { href: "/provisions", icon: <Layers />, label: "Provisions" },
        ]
    },
    {
        title: "Observability",
        items: [
            { href: "/analytics", icon: <BarChart2 />, label: "Analytics" },
            { href: "/analytics/traces", icon: <GitBranch />, label: "Traces" },
            { href: "/visitors", icon: <User />, label: "Visitor Analytics" },
            { href: "/geo", icon: <Globe />, label: "Geo Analytics" },
            { href: "/observability/grafana", icon: <LineChart />, label: "Grafana" },
            { href: "/alerts", icon: <ShieldAlert />, label: "Alerts" },
        ]
    },
    {
        title: "Intelligence",
        items: [
            { href: "/optimization", icon: <Zap />, label: "AI Tuner", badge: "Beta", badgeColor: "purple" },
            { href: "/reports", icon: <FileText />, label: "Reports" },
        ]
    },
    {
        title: "Admin",
        items: [
            { href: "/audit", icon: <ShieldAlert />, label: "Audit Logs" },
        ],
    },
    {
        title: "Settings",
        items: [
            { href: "/settings", icon: <Settings />, label: "General" },
            { href: "/settings/integrations", icon: <Globe />, label: "Integrations" },
            { href: "/settings/llm", icon: <Zap />, label: "LLM" },
            { href: "/waf", icon: <Lock />, label: "WAF Policies" },
        ],
    },
];

function EnvironmentTabsBar() {
    const { selectedProject } = useProject();

    if (!selectedProject) {
        return null;
    }

    return (
        <div
            className="px-6 py-2 border-b flex-shrink-0"
            style={{
                background: "rgb(var(--theme-surface))",
                borderColor: "rgb(var(--theme-border))"
            }}
        >
            <EnvironmentTabs />
        </div>
    );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [expandedSections, setExpandedSections] = useState<string[]>(
        NAV_SECTIONS.map(s => s.title) // All expanded by default
    );

    const toggleSection = (title: string) => {
        setExpandedSections(prev =>
            prev.includes(title)
                ? prev.filter(t => t !== title)
                : [...prev, title]
        );
    };

    // Get current page title for breadcrumb
    const getCurrentPageTitle = () => {
        for (const section of NAV_SECTIONS) {
            for (const item of section.items) {
                if (item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href))) {
                    return item.label;
                }
            }
        }
        // Check for dynamic routes
        if (pathname.startsWith("/servers/")) return "Server Details";
        if (pathname.startsWith("/agents/")) return "Agent Config";
        return "Dashboard";
    };

    // Don't show sidebar/header on login page - render children directly
    if (pathname === "/login") {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: "rgb(var(--theme-background))" }}>
            {/* Sidebar */}
            <aside
                className={`${sidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 border-r flex flex-col transition-all duration-300`}
                style={{
                    background: "rgb(var(--theme-surface))",
                    borderColor: "rgb(var(--theme-border))"
                }}
                role="navigation"
                aria-label="Main navigation"
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b" style={{ borderColor: "rgb(var(--theme-border))" }}>
                    {!sidebarCollapsed && (
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <Activity className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-lg leading-tight" style={{ color: "rgb(var(--theme-text))" }}>
                                    Avika
                                </span>
                                <span className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    v{APP_VERSION}
                                </span>
                            </div>
                        </Link>
                    )}
                    {sidebarCollapsed && (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto">
                            <Activity className="h-5 w-5 text-white" />
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {NAV_SECTIONS.map((section) => (
                        <div key={section.title} className="mb-2">
                            {!sidebarCollapsed && (
                                <button
                                    onClick={() => toggleSection(section.title)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium uppercase tracking-wider rounded hover:bg-white/5 transition-colors"
                                    style={{ color: "rgb(var(--theme-text-muted))" }}
                                >
                                    <span>{section.title}</span>
                                    {expandedSections.includes(section.title)
                                        ? <ChevronDown className="h-3 w-3" />
                                        : <ChevronRight className="h-3 w-3" />
                                    }
                                </button>
                            )}

                            {(sidebarCollapsed || expandedSections.includes(section.title)) && (
                                <div className={`${sidebarCollapsed ? '' : 'mt-1'} space-y-0.5`}>
                                    {section.items.map((item) => (
                                        <NavLink
                                            key={item.href}
                                            {...item}
                                            pathname={pathname}
                                            collapsed={sidebarCollapsed}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </nav>

                {/* Sidebar Footer */}
                <div className="border-t p-3" style={{ borderColor: "rgb(var(--theme-border))" }}>
                    {!sidebarCollapsed ? (
                        <div className="space-y-1">
                            <NavLink
                                href="/settings"
                                icon={<Settings />}
                                label="Settings"
                                pathname={pathname}
                                collapsed={sidebarCollapsed}
                            />
                            <button
                                onClick={() => setSidebarCollapsed(true)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
                                style={{ color: "rgb(var(--theme-text-muted))" }}
                            >
                                <Menu className="h-4 w-4" />
                                <span>Collapse</span>
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <NavLink
                                href="/settings"
                                icon={<Settings />}
                                label="Settings"
                                pathname={pathname}
                                collapsed={sidebarCollapsed}
                            />
                            <button
                                onClick={() => setSidebarCollapsed(false)}
                                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/5 transition-colors"
                                style={{ color: "rgb(var(--theme-text-muted))" }}
                                title="Expand sidebar"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header
                    className="h-16 flex items-center justify-between px-6 border-b flex-shrink-0"
                    style={{
                        background: "rgb(var(--theme-surface))",
                        borderColor: "rgb(var(--theme-border))"
                    }}
                >
                    {/* Left: Project Selector and Breadcrumb */}
                    <div className="flex items-center gap-4">
                        <ProjectSelector className="w-[180px]" />
                        <div className="w-px h-6 hidden md:block" style={{ background: "rgb(var(--theme-border))" }} />
                        <div className="hidden md:block">
                            <Breadcrumb />
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "rgb(var(--theme-text-muted))" }} />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-64 pl-10 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                style={{
                                    background: "rgb(var(--theme-background))",
                                    borderColor: "rgb(var(--theme-border))",
                                    color: "rgb(var(--theme-text))"
                                }}
                            />
                            <kbd
                                className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs rounded border"
                                style={{
                                    background: "rgb(var(--theme-surface))",
                                    borderColor: "rgb(var(--theme-border))",
                                    color: "rgb(var(--theme-text-muted))"
                                }}
                            >
                                ⌘K
                            </kbd>
                        </div>

                        {/* Help */}
                        <button
                            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                            title="Help & Documentation"
                            aria-label="Help and documentation"
                        >
                            <HelpCircle className="h-5 w-5" aria-hidden="true" />
                        </button>

                        {/* Notifications */}
                        <button
                            className="p-2 rounded-lg hover:bg-white/5 transition-colors relative"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                            title="Notifications"
                            aria-label="Notifications - you have new alerts"
                        >
                            <Bell className="h-5 w-5" aria-hidden="true" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full" aria-hidden="true" />
                        </button>

                        {/* Divider */}
                        <div className="w-px h-8 mx-2" style={{ background: "rgb(var(--theme-border))" }} />

                        {/* User Menu */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                        <User className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="hidden md:block text-left">
                                        <p className="text-sm font-medium" style={{ color: "rgb(var(--theme-text))" }}>
                                            {user?.username || "Admin"}
                                        </p>
                                        <p className="text-xs" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                            {user?.role || "Operator"}
                                        </p>
                                    </div>
                                    <ChevronDown className="h-4 w-4 hidden md:block" style={{ color: "rgb(var(--theme-text-muted))" }} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-56"
                                style={{
                                    background: "rgb(var(--theme-surface))",
                                    borderColor: "rgb(var(--theme-border))"
                                }}
                            >
                                <DropdownMenuLabel style={{ color: "rgb(var(--theme-text))" }}>
                                    My Account
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator style={{ background: "rgb(var(--theme-border))" }} />
                                <DropdownMenuItem asChild>
                                    <Link
                                        href="/change-password"
                                        className="flex items-center cursor-pointer"
                                        style={{ color: "rgb(var(--theme-text))" }}
                                    >
                                        <KeyRound className="mr-2 h-4 w-4" />
                                        Change Password
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link
                                        href="/settings"
                                        className="flex items-center cursor-pointer"
                                        style={{ color: "rgb(var(--theme-text))" }}
                                    >
                                        <Settings className="mr-2 h-4 w-4" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator style={{ background: "rgb(var(--theme-border))" }} />
                                <DropdownMenuItem
                                    onClick={logout}
                                    className="flex items-center cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Environment Tabs */}
                <EnvironmentTabsBar />

                {/* Main Content */}
                <main
                    className="flex-1 overflow-auto p-6"
                    style={{ background: "rgb(var(--theme-background))" }}
                    role="main"
                    aria-label="Main content"
                >
                    {children}
                </main>
            </div>
        </div>
    );
}

interface NavLinkProps {
    href: string;
    icon: ReactNode;
    label: string;
    pathname: string;
    collapsed: boolean;
    badge?: string;
    badgeColor?: string;
}

function NavLink({ href, icon, label, pathname, collapsed, badge, badgeColor = "blue" }: NavLinkProps) {
    const isActive = href === "/"
        ? pathname === "/"
        : pathname.startsWith(href) && (href !== "/" || pathname === "/");

    // Theme-aware badge colors using CSS variables
    const badgeStyles: Record<string, React.CSSProperties> = {
        blue: { background: "rgba(var(--theme-primary), 0.2)", color: "rgb(var(--theme-primary))" },
        purple: { background: "rgba(139, 92, 246, 0.2)", color: "rgb(139, 92, 246)" },
        green: { background: "rgba(var(--theme-success), 0.2)", color: "rgb(var(--theme-success))" },
        amber: { background: "rgba(var(--theme-warning), 0.2)", color: "rgb(var(--theme-warning))" },
    };

    return (
        <Link
            href={href}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${collapsed ? 'justify-center' : ''}`}
            style={isActive ? {
                background: "rgba(var(--theme-primary), 0.1)",
                color: "rgb(var(--theme-primary))",
            } : {
                color: "rgb(var(--theme-text-muted))",
            }}
            title={collapsed ? label : undefined}
        >
            <span className="[&>svg]:h-4 [&>svg]:w-4 flex-shrink-0">{icon}</span>
            {!collapsed && (
                <>
                    <span className="flex-1">{label}</span>
                    {badge && (
                        <Badge
                            className="text-[10px] px-1.5 py-0"
                            style={badgeStyles[badgeColor] || badgeStyles.blue}
                        >
                            {badge}
                        </Badge>
                    )}
                </>
            )}
        </Link>
    );
}
