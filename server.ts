import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import path from "path";
import { readFileSync } from "fs";

import { initializeDatabase } from "./src/db/schema.js";
import { seedDatabase } from "./src/db/seed.js";
import { registerRememberTool } from "./src/tools/remember.js";
import { registerRecallTool } from "./src/tools/recall.js";
import { registerForgetTool } from "./src/tools/forget.js";
import { registerListTool } from "./src/tools/list.js";
import { registerResources } from "./src/context/resource.js";

// Initialize database
const dbPath = path.join(process.cwd(), "data", "memories.db");
const db = initializeDatabase(dbPath);
seedDatabase(db);

// Load widget HTML once at startup
const widgetHtml = readFileSync(
  path.join(process.cwd(), "resources", "memory-dashboard", "widget.html"),
  "utf-8"
);
const DASHBOARD_URI = "ui://agent-memory/dashboard.html";

function createMcpServer() {
  const server = new McpServer({
    name: "agent-memory",
    version: "1.0.0",
  });

  registerRememberTool(server, db);
  registerRecallTool(server, db);
  registerForgetTool(server, db);
  registerListTool(server, db);
  registerResources(server, db);

  // Register the dashboard widget as an MCP App resource
  registerAppResource(
    server,
    "Memory Dashboard",
    DASHBOARD_URI,
    { description: "Interactive agent memory dashboard" },
    async () => ({
      contents: [{
        uri: DASHBOARD_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
      }],
    })
  );

  return server;
}

// Set up Express
const app = express();
app.use(cors());
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId)!;
    trackSession(sessionId);
  } else if (!sessionId) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    // Session ID is assigned during handleRequest for init
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
      trackSession(transport.sessionId);
    }
    return;
  } else {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.get("/health", (_req, res) => {
  const count = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
  res.json({ status: "ok", memories: count });
});

// Session cleanup: remove stale sessions older than 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessionLastSeen = new Map<string, number>();

function trackSession(sessionId: string) {
  sessionLastSeen.set(sessionId, Date.now());
}

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastSeen] of sessionLastSeen) {
    if (now - lastSeen > SESSION_TTL_MS) {
      const transport = transports.get(sessionId);
      if (transport) {
        transport.close?.();
        transports.delete(sessionId);
      }
      sessionLastSeen.delete(sessionId);
    }
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Agent Memory MCP server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(cleanupInterval);
  for (const [sessionId, transport] of transports) {
    transport.close?.();
    transports.delete(sessionId);
  }
  sessionLastSeen.clear();
  db.close();
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  // Force exit after 5 seconds if graceful close hangs
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
