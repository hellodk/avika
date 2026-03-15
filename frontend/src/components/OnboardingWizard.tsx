"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Server, FolderKanban, Activity, ArrowRight, X, Cpu, Zap } from "lucide-react";
import Link from "next/link";

const ONBOARDING_KEY = "avika_onboarding_complete";

const steps = [
    {
        id: "welcome",
        icon: Zap,
        title: "Welcome to Avika NGINX Manager",
        description: "Your intelligent fleet management platform for NGINX. Let's get you set up in under 2 minutes.",
        cta: "Get Started",
        iconColor: "text-indigo-500",
        iconBg: "bg-indigo-500/10",
    },
    {
        id: "agent",
        icon: Cpu,
        title: "Connect Your First Agent",
        description: "Install the Avika agent on your NGINX server. The agent will automatically connect to this gateway and start reporting.",
        hint: "Run this on your server:",
        code: "curl -sSL https://get.avika.ai | sudo bash",
        cta: "I've installed the agent",
        link: { label: "View Enrollment Guide →", href: "/settings" },
        iconColor: "text-emerald-500",
        iconBg: "bg-emerald-500/10",
    },
    {
        id: "project",
        icon: FolderKanban,
        title: "Organize with Projects",
        description: "Projects and environments help you group agents logically — e.g., 'Production' → 'US-East', 'EU-West'. You can assign agents in the Inventory page.",
        cta: "Create a Project",
        link: { label: "Skip for now", href: null },
        iconColor: "text-amber-500",
        iconBg: "bg-amber-500/10",
    },
    {
        id: "monitor",
        icon: Activity,
        title: "You're All Set!",
        description: "Your dashboard is ready. Head to Inventory to see connected agents, or Analytics to explore traffic insights.",
        cta: "Go to Dashboard",
        iconColor: "text-blue-500",
        iconBg: "bg-blue-500/10",
    },
];

export function OnboardingWizard() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Show only if the user hasn't completed onboarding
        if (typeof window !== "undefined") {
            const done = localStorage.getItem(ONBOARDING_KEY);
            if (!done) setOpen(true);
        }
    }, []);

    const handleComplete = () => {
        localStorage.setItem(ONBOARDING_KEY, "true");
        setOpen(false);
    };

    const handleNext = () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            handleComplete();
        }
    };

    const current = steps[step];
    const Icon = current.icon;
    const progress = ((step + 1) / steps.length) * 100;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) handleComplete(); }}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden" style={{ background: "rgb(var(--theme-surface))", borderColor: "rgb(var(--theme-border))" }}>
                <DialogTitle className="sr-only">{current.title}</DialogTitle>
                <DialogDescription className="sr-only">{current.description}</DialogDescription>
                {/* Progress Bar */}
                <div className="h-1 w-full" style={{ background: "rgb(var(--theme-border))" }}>
                    <div
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="p-6 pt-4">
                    {/* Step Counter */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex gap-1.5">
                            {steps.map((s, i) => (
                                <div
                                    key={s.id}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? "w-6 bg-indigo-500" : "w-3 bg-gray-600"}`}
                                />
                            ))}
                        </div>
                        <button onClick={handleComplete} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Icon */}
                    <div className={`p-3 rounded-xl w-14 h-14 flex items-center justify-center mb-5 ${current.iconBg}`}>
                        <Icon className={`h-7 w-7 ${current.iconColor}`} />
                    </div>

                    {/* Content */}
                    <h2 className="text-xl font-semibold mb-2" style={{ color: "rgb(var(--theme-text))" }}>
                        {current.title}
                    </h2>
                    <p className="text-sm leading-relaxed mb-4" style={{ color: "rgb(var(--theme-text-muted))" }}>
                        {current.description}
                    </p>

                    {/* Code block */}
                    {current.code && (
                        <div className="mb-4 rounded-lg p-3 font-mono text-sm" style={{ background: "rgb(var(--theme-background))", borderColor: "rgb(var(--theme-border))", border: "1px solid" }}>
                            <p style={{ color: "rgb(var(--theme-text))" }}>{current.code}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={handleNext}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {current.cta}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                        {current.link && (
                            current.link.href ? (
                                <Link href={current.link.href}>
                                    <Button variant="ghost" size="sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
                                        {current.link.label}
                                    </Button>
                                </Link>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={handleComplete} style={{ color: "rgb(var(--theme-text-muted))" }}>
                                    {current.link.label}
                                </Button>
                            )
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
