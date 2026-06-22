import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export const metadata: Metadata = {
  title: "Nexus Agent Harness — Dashboard",
  description:
    "Real-time monitoring dashboard for autonomous LLM agents. Visualize system health, token burn analytics, and live shell telemetry.",
  keywords: ["MCP", "LLM", "agent", "monitoring", "telemetry", "token analytics"],
  authors: [{ name: "Nexus Agent Harness" }],
  openGraph: {
    title: "Nexus Agent Harness Dashboard",
    description: "Real-time monitoring for autonomous LLM agents",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content page-enter">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
