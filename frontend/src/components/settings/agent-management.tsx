import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Server, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

export function AgentManagement() {
    const [isDeletingAgents, setIsDeletingAgents] = useState(false);
    const [deletionMessage, setDeletionMessage] = useState("");

    const handleDeleteOfflineAgents = async () => {
        setIsDeletingAgents(true);
        setDeletionMessage("");
        try {
            const res = await apiFetch('/api/servers');
            if (!res.ok) throw new Error("Failed to fetch agents");
            const data = await res.json();
            const agents = data.agents || [];

            // Get agents not seen in last 10 minutes (offline)
            const now = Math.floor(Date.now() / 1000);
            const offlineAgents = agents.filter((a: any) => {
                if (!a.last_seen) return false;
                return (now - parseInt(a.last_seen)) > 600;
            });

            if (offlineAgents.length === 0) {
                toast.info("No offline agents found", { description: "All agents are currently online." });
                setIsDeletingAgents(false);
                return;
            }

            let deletedCount = 0;
            for (const agent of offlineAgents) {
                const id = agent.agent_id || agent.id;
                if (!id) continue;
                const delRes = await apiFetch(`/api/servers/${id}`, { method: 'DELETE' });
                if (delRes.ok) deletedCount++;
            }

            toast.success("Cleanup complete", { description: `Successfully deleted ${deletedCount} offline agents.` });
            setDeletionMessage(`Successfully deleted ${deletedCount} agents.`);
            setTimeout(() => setDeletionMessage(""), 3000);
        } catch (error: any) {
            console.error(error);
            toast.error("Cleanup failed", { description: error.message });
            setDeletionMessage("Error occurred during cleanup.");
        } finally {
            setIsDeletingAgents(false);
        }
    };

    return (
        <Card style={{ backgroundColor: 'rgb(var(--theme-surface))', borderColor: 'rgb(var(--theme-border))' }}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-blue-400" />
                    <CardTitle className="text-base" style={{ color: 'rgb(var(--theme-text))' }}>Agent Management</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label style={{ color: 'rgb(var(--theme-text))' }}>Cleanup</Label>
                    <p className="text-sm text-slate-500 mb-2">Remove agents that are currently offline from the inventory.</p>
                    <Button
                        variant="destructive"
                        onClick={handleDeleteOfflineAgents}
                        disabled={isDeletingAgents}
                        className="w-full sm:w-auto"
                    >
                        {isDeletingAgents ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Cleaning up...
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Offline Agents
                            </>
                        )}
                    </Button>
                    {deletionMessage && (
                        <p className={`text-sm mt-2 ${deletionMessage.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}>
                            {deletionMessage}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
