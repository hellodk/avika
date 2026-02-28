import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme-provider";

export const metadata: Metadata = {
  title: "Login - Avika",
  description: "Sign in to Avika NGINX Manager",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page has its own layout without the dashboard sidebar
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
