import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { once } from "node:events";

const dir = mkdtempSync(path.join(tmpdir(), "sach-security-"));
process.env.DOTENV_CONFIG_PATH = path.join(dir, "no-env-file");
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.ALLOW_DEMO_FALLBACK = "false";
process.env.NODE_ENV = "test";

test("authentication, scan isolation and inference failures", async (t) => {
  const { createApp } = await import("../src/app.js");
  const { db } = await import("../src/db/index.js");
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = (url: string, body: unknown, extra = {}) => fetch(base + url, {
    method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body),
  });
  try {
    await t.test("rejects requests from another origin", async () => {
      const response = await post("/auth/register", {}, { origin: "https://untrusted.example" });
      assert.equal(response.status, 403);
    });
    await t.test("requires authentication", async () => {
      assert.equal((await fetch(base + "/scans")).status, 401);
    });
    const registration = await post("/auth/register", {
      email: "owner@example.test", password: "valid-test-password", name: "Test Owner",
    }, { origin: "http://localhost:8080" });
    assert.equal(registration.status, 201);
    const cookie = registration.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    await registration.json();
    await t.test("rejects passwords exceeding bcrypt's byte limit", async () => {
      const response = await post("/auth/register", {
        email: "long@example.test", password: "é".repeat(40), name: "Long Password",
      });
      assert.equal(response.status, 400);
    });
    await t.test("hides scans belonging to other users", async () => {
      db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").run("other", "other@example.test", "Other", "hash", new Date().toISOString());
      db.prepare("INSERT INTO scans (id,user_id,file_name,status,created_at) VALUES (?,?,?,?,?)").run("private-scan", "other", "private.mp4", "pending", new Date().toISOString());
      assert.equal((await fetch(base + "/scans/private-scan", { headers: { cookie } })).status, 404);
      assert.equal((await fetch(base + "/scans/private-scan", { method: "DELETE", headers: { cookie } })).status, 404);
    });
    await t.test("records failed inference without generating a fake verdict", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error("inference unavailable"); };
      try {
        const body = new FormData();
        body.append("video", new Blob(["video fixture"], { type: "video/mp4" }), "test.mp4");
        const response = await originalFetch(base + "/scans", { method: "POST", headers: { cookie }, body });
        assert.equal(response.status, 201);
        const { scan } = await response.json();
        assert.equal(scan.status, "failed");
        assert.equal(scan.engine, null);
        assert.equal(scan.probability, null);
        assert.equal(scan.report, null);
      } finally { globalThis.fetch = originalFetch; }
    });
    await t.test("rejects unsupported multipart uploads", async () => {
      const body = new FormData();
      body.append("video", new Blob(["text"], { type: "text/plain" }), "notes.txt");
      assert.equal((await fetch(base + "/scans", { method: "POST", headers: { cookie }, body })).status, 400);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production rejects missing signing secrets and demo inference", () => {
  for (const overrides of [{ JWT_SECRET: "", ALLOW_DEMO_FALLBACK: "false" }, { JWT_SECRET: "secure-test-secret-at-least-32-characters", ALLOW_DEMO_FALLBACK: "true" }]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/config.ts"], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", ...overrides }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET|Simulated detection/);
  }
});
