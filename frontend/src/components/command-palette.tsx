"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Server,
  Activity,
  Shield,
  FileText,
  PlugZap,
  LayoutDashboard,
  Settings,
  Activity as ListHeart, // alias to keep the code below working
  Network,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/inventory"))}>
            <Server className="mr-2 h-4 w-4" />
            <span>Servers</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/waf"))}>
            <Shield className="mr-2 h-4 w-4" />
            <span>WAF Policies</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/monitoring"))}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Monitoring</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/observability/slo"))}>
            <ListHeart className="mr-2 h-4 w-4" />
            <span>SLOs & SLIs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/reports"))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Reports</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings/integrations"))}>
            <PlugZap className="mr-2 h-4 w-4" />
            <span>Integrations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => runCommand(() => router.push("/inventory?action=add-server"))}>
            <Server className="mr-2 h-4 w-4" />
            <span>Add Server</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/waf?action=create-policy"))}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Create WAF Policy</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
