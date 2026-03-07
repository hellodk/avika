"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Activity, BarChart2, Server, Settings, ShieldAlert, Zap,
    FileText, Heart, Cpu, ChevronDown, ChevronRight,
    Search, Bell, User, Menu, X, HelpCircle, LogOut,
    LayoutDashboard, Layers, GitBranch, Terminal, BookOpen, KeyRound, Globe,
    LineChart, Users, FolderKanban, Lock, Info, Key, ShieldCheck
} from "lucide-react";
import { ProjectSelector } from "@/components/project-selector";
import { EnvironmentTabs } from "@/components/environment-tabs";
import { useProject } from "@/lib/project-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { useTheme } from "@/lib/theme-provider";

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
        title: "Operations",
        items: [
            { href: "/", icon: <LayoutDashboard />, label: "Dashboard" },
            { href: "/system", icon: <Heart />, label: "System Health" },
            { href: "/monitoring", icon: <Cpu />, label: "Monitoring" },
            { href: "/analytics", icon: <BarChart2 />, label: "Analytics" },
            { href: "/alerts", icon: <ShieldAlert />, label: "Alerts" },
            { href: "/reports", icon: <FileText />, label: "Reports" },
        ]
    },
    {
        title: "Management",
        items: [
            { href: "/inventory", icon: <Server />, label: "Inventory" },
            { href: "/provisions", icon: <Layers />, label: "Provisions" },
            { href: "/optimization", icon: <Zap />, label: "AI Tuner", badge: "Beta", badgeColor: "purple" },
            { href: "/audit", icon: <ShieldCheck />, label: "Audit Logs" },
        ]
    },
    {
        title: "Settings",
        items: [
            { href: "/settings", icon: <Settings />, label: "General" },
            { href: "/settings/integrations", icon: <Globe />, label: "Integrations" },
            { href: "/settings/security", icon: <Lock />, label: "Security" },
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
            className="dashboard-layout-env-tabs px-6 py-2 border-b flex-shrink-0"
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
    const router = useRouter();
    const { theme } = useTheme();
    const { user, logout } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const layoutVariant = theme === "rocker" ? "layout-rocker" : theme === "dashboard" ? "layout-ui-kit" : "";
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [expandedSections, setExpandedSections] = useState<string[]>(
        NAV_SECTIONS.map(s => s.title) // All expanded by default
    );

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (q) {
            router.push(`/inventory?q=${encodeURIComponent(q)}`);
        } else {
            router.push("/inventory");
        }
    };

    const toggleSection = (title: string) => {
        setExpandedSections(prev =>
            prev.includes(title)
                ? prev.filter(t => t !== title)
                : [...prev, title]
        );
    };

    // Get current page title for breadcrumb (match longest href so /analytics/visitors -> Visitor Analytics)
    const getCurrentPageTitle = () => {
        let best: string | null = null;
        let bestLen = 0;
        for (const section of NAV_SECTIONS) {
            for (const item of section.items) {
                const match = item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href));
                if (match && item.href.length > bestLen) {
                    best = item.label;
                    bestLen = item.href.length;
                }
            }
        }
        if (best) return best;
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
        <div
            className={`flex h-screen overflow-hidden ${layoutVariant}`}
            style={{ background: "rgb(var(--theme-background))" }}
            data-layout-variant={layoutVariant || undefined}
        >
            {/* Sidebar */}
            <aside
                className={`dashboard-layout-sidebar ${sidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 border-r flex flex-col transition-all duration-300`}
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
                                    className="nav-section-header w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium uppercase tracking-wider rounded hover-surface"
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

                {/* Sidebar Footer - Collapse/Expand only (Settings is in System section) */}
                <div className="border-t p-3" style={{ borderColor: "rgb(var(--theme-border))" }}>
                    {!sidebarCollapsed ? (
                        <button
                            onClick={() => setSidebarCollapsed(true)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover-surface"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                        >
                            <Menu className="h-4 w-4" />
                            <span>Collapse</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setSidebarCollapsed(false)}
                            className="w-full flex items-center justify-center p-2 rounded-lg hover-surface"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                            title="Expand sidebar"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden dashboard-layout-main-wrap">
                {/* Header */}
                <header
                    className="dashboard-layout-header h-16 flex items-center justify-between px-6 border-b flex-shrink-0"
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
                        {/* Search: navigates to Inventory with query (⌘K to focus) */}
                        <form onSubmit={handleSearchSubmit} className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "rgb(var(--theme-text-muted))" }} aria-hidden="true" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search agents..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-64 pl-10 pr-12 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                style={{
                                    background: "rgb(var(--theme-background))",
                                    borderColor: "rgb(var(--theme-border))",
                                    color: "rgb(var(--theme-text))"
                                }}
                                aria-label="Search agents (navigates to Inventory)"
                            />
                            <kbd
                                className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs rounded border pointer-events-none"
                                style={{
                                    background: "rgb(var(--theme-surface))",
                                    borderColor: "rgb(var(--theme-border))",
                                    color: "rgb(var(--theme-text-muted))"
                                }}
                                aria-hidden="true"
                            >
                                ⌘K
                            </kbd>
                        </form>

                        {/* Help */}
                        <button
                            className="p-2 rounded-lg hover-surface"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                            title="Help & Documentation"
                            aria-label="Help and documentation"
                        >
                            <HelpCircle className="h-5 w-5" aria-hidden="true" />
                        </button>

                        {/* Notifications */}
                        <button
                            className="p-2 rounded-lg hover-surface relative"
                            style={{ color: "rgb(var(--theme-text-muted))" }}
                            title="Notifications"
                            aria-label="Notifications"
                        >
                            <Bell className="h-5 w-5" aria-hidden="true" />
                        </button>

                        {/* Divider */}
                        <div className="w-px h-8 mx-2" style={{ background: "rgb(var(--theme-border))" }} />

                        {/* User Menu */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover-surface"
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
                    className="dashboard-layout-main flex-1 overflow-auto p-6"
                    style={{ background: "rgb(var(--theme-background))" }}
                    role="main"
                    aria-label="Main content"
                >
                    {/* Rocker / UI Kit: page title bar at top of content (matches reference demos) */}
                    {(layoutVariant === "layout-rocker" || layoutVariant === "layout-ui-kit") && (
                        <div className="dashboard-layout-page-title" data-layout-variant={layoutVariant}>
                            <h1 className="dashboard-layout-page-title-text" style={{ color: "rgb(var(--theme-text))" }}>
                                {getCurrentPageTitle()}
                            </h1>
                        </div>
                    )}
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
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all nav-link ${collapsed ? 'justify-center' : ''} ${isActive ? 'nav-link-active' : ''}`}
            style={isActive ? {
                background: "rgba(var(--theme-primary), 0.1)",
                color: "rgb(var(--theme-primary))",
            } : {
                color: "rgb(var(--theme-text-muted))",
            }}
            title={collapsed ? label : undefined}
            data-active={isActive ? "true" : undefined}
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
