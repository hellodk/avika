import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "rgb(var(--theme-background))" }}
    >
      <div className="flex flex-col items-center max-w-md text-center gap-6">
        <h1 className="text-6xl font-bold text-muted-foreground/50">404</h1>
        <h2 className="text-xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
          Page not found
        </h2>
        <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
          The page you’re looking for doesn’t exist or was moved.
        </p>
        <Button asChild>
          <Link href="/" className="gap-2">
            <Home className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
