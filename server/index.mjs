import express from "express";
import initSqlJs from "sql.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const dataDir = join(rootDir, "data");
const dbPath = join(dataDir, "progress.db");
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT ?? 4174);

const SQL = await initSqlJs({
  locateFile: (file) => join(rootDir, "node_modules", "sql.js", "dist", file),
});

await mkdir(dataDir, { recursive: true });

const database = existsSync(dbPath) ? new SQL.Database(await readFile(dbPath)) : new SQL.Database();

database.run(`
  CREATE TABLE IF NOT EXISTS word_stats (
    word_id TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    last_answered_at INTEGER,
    last_correct INTEGER
  );
`);

database.run(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

database.run("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('created_at', ?)", [new Date().toISOString()]);

await persist();

const app = express();
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, database: dbPath });
});

app.get("/api/stats", (_request, response) => {
  response.json(readStats());
});

app.post("/api/answer", async (request, response, next) => {
  try {
    const { wordId, isCorrect } = request.body ?? {};

    if (typeof wordId !== "string" || wordId.length === 0 || typeof isCorrect !== "boolean") {
      response.status(400).json({ error: "wordId and isCorrect are required" });
      return;
    }

    const current = readStat(wordId);
    const nextStat = {
      attempts: current.attempts + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
      wrong: current.wrong + (isCorrect ? 0 : 1),
      streak: isCorrect ? Math.max(0, current.streak) + 1 : Math.min(0, current.streak) - 1,
      lastAnsweredAt: Date.now(),
      lastCorrect: isCorrect,
    };

    database.run(
      `
        INSERT INTO word_stats (word_id, attempts, correct, wrong, streak, last_answered_at, last_correct)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(word_id) DO UPDATE SET
          attempts = excluded.attempts,
          correct = excluded.correct,
          wrong = excluded.wrong,
          streak = excluded.streak,
          last_answered_at = excluded.last_answered_at,
          last_correct = excluded.last_correct
      `,
      [
        wordId,
        nextStat.attempts,
        nextStat.correct,
        nextStat.wrong,
        nextStat.streak,
        nextStat.lastAnsweredAt,
        nextStat.lastCorrect ? 1 : 0,
      ],
    );

    await persist();
    response.json(readStats());
  } catch (error) {
    next(error);
  }
});

app.post("/api/reset", async (_request, response, next) => {
  try {
    database.run("DELETE FROM word_stats");
    await persist();
    response.json({});
  } catch (error) {
    next(error);
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(join(distDir, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Stress trainer server: http://127.0.0.1:${port}`);
  console.log(`Progress database: ${dbPath}`);
});

function readStat(wordId) {
  const result = database.exec(
    `
      SELECT attempts, correct, wrong, streak, last_answered_at, last_correct
      FROM word_stats
      WHERE word_id = ?
    `,
    [wordId],
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return { attempts: 0, correct: 0, wrong: 0, streak: 0 };
  }

  return rowToStat(result[0].values[0]);
}

function readStats() {
  const result = database.exec(`
    SELECT word_id, attempts, correct, wrong, streak, last_answered_at, last_correct
    FROM word_stats
    ORDER BY word_id
  `);

  if (result.length === 0) return {};

  return Object.fromEntries(result[0].values.map(([wordId, ...values]) => [wordId, rowToStat(values)]));
}

function rowToStat([attempts, correct, wrong, streak, lastAnsweredAt, lastCorrect]) {
  return {
    attempts: Number(attempts),
    correct: Number(correct),
    wrong: Number(wrong),
    streak: Number(streak),
    lastAnsweredAt: lastAnsweredAt === null ? undefined : Number(lastAnsweredAt),
    lastCorrect: lastCorrect === null ? undefined : Boolean(lastCorrect),
  };
}

async function persist() {
  await writeFile(dbPath, Buffer.from(database.export()));
}
