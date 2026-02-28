import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";
import DashboardLayout from "@/components/dashboard-layout";
import { ThemeProvider } from "@/lib/theme-provider";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth-provider";

const inter = Inter({ subsets: ["latin"] });
const orbitron = Orbitron({
  subsets: ["latin"],
  variable: '--font-orbitron',
  weight: ['400', '500', '600', '700', '800', '900']
});

export const metadata: Metadata = {
  title: "Avika - AI NGINX Manager",
  description: "AI-driven NGINX Fleet Management powered by Avika",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} ${orbitron.variable}`}>
        <ThemeProvider>
          <AuthProvider>
            <DashboardLayout>{children}</DashboardLayout>
          </AuthProvider>
          <Toaster 
            position="top-right" 
            theme="dark"
            richColors
            closeButton
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
