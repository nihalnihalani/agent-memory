import type Database from "better-sqlite3";
import { upsertMemory } from "./queries.js";
import fs from "fs";
import path from "path";

interface SeedMemory {
  key: string;
  value: string;
  type: string;
  context: string;
  agent_id: string;
  tags: string[];
}

export function seedDatabase(db: Database.Database): void {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM memories`).get() as { c: number }).c;
  if (count > 0) {
    return;
  }

  const seedPath = path.join(process.cwd(), "data", "seed.json");
  if (!fs.existsSync(seedPath)) {
    console.warn("No seed.json found at", seedPath);
    return;
  }

  const seeds: SeedMemory[] = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

  const transaction = db.transaction(() => {
    for (const seed of seeds) {
      upsertMemory(db, {
        key: seed.key,
        value: seed.value,
        type: seed.type,
        context: seed.context,
        agent_id: seed.agent_id,
        tags: seed.tags,
      });
    }
  });

  transaction();
  console.log(`Seeded ${seeds.length} memories`);
}
