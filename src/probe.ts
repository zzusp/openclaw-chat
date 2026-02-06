/**
 * OpenClaw Chat connectivity probe.
 *
 * Validates that the WebSocket server is reachable on host/port.
 */

import net from "node:net";

import type { OpenclawChatProbeResult } from "./types.js";

export async function probeOpenclawChat(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<OpenclawChatProbeResult> {
  if (!port || port <= 0) {
    return { ok: false, error: "Missing port", elapsedMs: 0 };
  }

  const targetHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const start = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: OpenclawChatProbeResult) => {
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ ok: false, error: `Timeout after ${timeoutMs}ms`, elapsedMs: Date.now() - start });
    }, timeoutMs);

    socket.once("error", (err) => {
      clearTimeout(timer);
      done({ ok: false, error: err.message, elapsedMs: Date.now() - start });
    });

    socket.connect(port, targetHost, () => {
      clearTimeout(timer);
      done({ ok: true, elapsedMs: Date.now() - start });
    });
  });
}
