import { MCPServer } from "mcp-use/server";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./src/db/schema.js";
import { seedDatabase } from "./src/db/seed.js";
import { registerMemoryTools } from "./src/tools/memory-tools.js";
import { registerHandoffTools } from "./src/tools/handoff-tools.js";
import { registerUtilityTools } from "./src/tools/utility-tools.js";
import { registerResources } from "./src/resources/index.js";
import { registerPrompts } from "./src/prompts/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database initialization ---
const dbPath = path.resolve(__dirname, "data", "agent-memory.db");
const db = initializeDatabase(dbPath);
if (!process.env.SKIP_SEED) {
  seedDatabase(db);
}

// --- MCP Server ---
const server = new MCPServer({
  name: "agent-memory",
  title: "Agent Memory",
  version: "1.0.0",
  description: "Shared memory layer for multi-agent collaboration. Store, search, and recall knowledge across AI agents.",
  baseUrl: process.env.MCP_URL || `http://localhost:${process.env.PORT || "3010"}`,
  favicon: "favicon.ico",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

// --- Register tools, resources, and prompts ---
registerMemoryTools(server, db);
registerHandoffTools(server, db);
registerUtilityTools(server, db);
registerResources(server, db);
registerPrompts(server, db);

// --- Health check ---
server.app.get("/api/health", (c) => {
  const count = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as any).c;
  return c.json({ status: "ok", memories: count });
});

// --- Graceful shutdown ---
function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  try {
    db.close();
    console.log("Database connection closed.");
  } catch (err: any) {
    console.error(`Error closing database: ${err.message}`);
  }
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// --- Start ---
const PORT = parseInt(process.env.PORT || "3010");
console.log(`Agent Memory server starting on port ${PORT}`);
server.listen(PORT);
