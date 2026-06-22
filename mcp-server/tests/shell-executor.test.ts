/**
 * @file tests/shell-executor.test.ts
 * Vitest unit tests for the shell executor module.
 */

import { describe, it, expect } from "vitest";
import {
  createShellSession,
  executeCommand,
  getShellSession,
  terminateShellSession,
  listShellSessions,
} from "../src/tools/shell-executor.js";

const SESSION_ID = "test-mcp-session-001";
const AGENT_ID = "test-agent-shell-001";

describe("Shell Executor", () => {
  describe("createShellSession", () => {
    it("creates a new shell session with defaults", () => {
      const session = createShellSession({
        sessionId: SESSION_ID,
        agentId: AGENT_ID,
        environment: {},
      });

      expect(session.id).toBeTruthy();
      expect(session.status).toBe("idle");
      expect(session.agentId).toBe(AGENT_ID);
      expect(session.sessionId).toBe(SESSION_ID);
      expect(session.totalCommands).toBe(0);
    });

    it("uses custom cwd and shell", () => {
      const session = createShellSession({
        sessionId: SESSION_ID,
        agentId: AGENT_ID,
        cwd: "/tmp",
        shell: "/bin/sh",
        environment: {},
      });

      expect(session.cwd).toBe("/tmp");
      expect(session.shell).toBe("/bin/sh");
    });
  });

  describe("executeCommand", () => {
    it("executes a simple echo command", async () => {
      const session = createShellSession({
        sessionId: `exec-session-${Date.now()}`,
        agentId: AGENT_ID,
        environment: {},
      });

      const result = await executeCommand({
        shellSessionId: session.id,
        command: 'echo "hello nexus"',
        captureStderr: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello nexus");
      expect(result.timedOut).toBe(false);
      expect(result.truncated).toBe(false);
    }, 10000);

    it("returns non-zero exit code for failing commands", async () => {
      const session = createShellSession({
        sessionId: `fail-session-${Date.now()}`,
        agentId: AGENT_ID,
        environment: {},
      });

      const result = await executeCommand({
        shellSessionId: session.id,
        command: "false",
        captureStderr: true,
      });

      expect(result.exitCode).not.toBe(0);
    }, 10000);

    it("blocks prohibited patterns", async () => {
      const session = createShellSession({
        sessionId: `sec-session-${Date.now()}`,
        agentId: AGENT_ID,
        environment: {},
      });

      await expect(
        executeCommand({
          shellSessionId: session.id,
          command: "rm -rf /",
          captureStderr: true,
        })
      ).rejects.toThrow("[Security]");
    }, 5000);

    it("throws for unknown session", async () => {
      await expect(
        executeCommand({
          shellSessionId: "nonexistent-session-id",
          command: "echo test",
          captureStderr: true,
        })
      ).rejects.toThrow("[ShellExecutor]");
    });
  });

  describe("getShellSession", () => {
    it("returns session with history", async () => {
      const session = createShellSession({
        sessionId: `hist-session-${Date.now()}`,
        agentId: AGENT_ID,
        environment: {},
      });

      await executeCommand({
        shellSessionId: session.id,
        command: 'echo "history test"',
        captureStderr: true,
      });

      const retrieved = getShellSession({
        shellSessionId: session.id,
        includeHistory: true,
        historyLimit: 10,
      });

      expect(retrieved.historySlice).toHaveLength(1);
      expect(retrieved.historySlice[0]?.command).toBe('echo "history test"');
    }, 10000);
  });

  describe("terminateShellSession", () => {
    it("terminates a session", async () => {
      const session = createShellSession({
        sessionId: `term-session-${Date.now()}`,
        agentId: AGENT_ID,
        environment: {},
      });

      await executeCommand({
        shellSessionId: session.id,
        command: "echo terminate_test",
        captureStderr: true,
      });

      const result = terminateShellSession({ shellSessionId: session.id });
      expect(result.terminated).toBe(true);
      expect(result.totalCommands).toBe(1);
    }, 10000);
  });

  describe("listShellSessions", () => {
    it("lists sessions for an agent", () => {
      const uniqueAgent = `agent-list-${Date.now()}`;
      const s1 = createShellSession({
        sessionId: "sess-list-1",
        agentId: uniqueAgent,
        environment: {},
      });
      const s2 = createShellSession({
        sessionId: "sess-list-2",
        agentId: uniqueAgent,
        environment: {},
      });

      const sessions = listShellSessions({
        agentId: uniqueAgent,
        statusFilter: "all",
      });

      expect(sessions.length).toBeGreaterThanOrEqual(2);
      const ids = sessions.map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).toContain(s2.id);
    });
  });
});
