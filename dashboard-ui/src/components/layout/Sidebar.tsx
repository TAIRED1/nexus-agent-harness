"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", icon: "⬡", label: "Overview" },
  { href: "/system", icon: "⚙", label: "System" },
  { href: "/analytics", icon: "◈", label: "Token Analytics" },
  { href: "/shell", icon: "⌨", label: "Shell Sessions" },
  { href: "/events", icon: "⚡", label: "Event Stream" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">⬡</div>
        <span className="sidebar-logo-text">Nexus</span>
      </div>

      {/* Navigation */}
      <span className="sidebar-section-label">Navigation</span>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item ${pathname === item.href ? "active" : ""}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </Link>
      ))}

      {/* Footer */}
      <div className="mt-auto">
        <span className="sidebar-section-label">Resources</span>
        <a
          href="http://localhost:3001/health"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item"
        >
          <span className="nav-icon">♥</span>
          Health Check
        </a>
        <a
          href="http://localhost:3001/api/telemetry/buffer"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item"
        >
          <span className="nav-icon">◎</span>
          Telemetry Buffer
        </a>
        <div
          style={{
            padding: "12px 8px",
            marginTop: "12px",
            borderTop: "1px solid var(--color-border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            v1.0.0 · MCP 2024-11-05
          </div>
        </div>
      </div>
    </aside>
  );
}
