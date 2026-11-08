import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { expect, test } from "vitest";
import { QatafoDatabase } from "../src/db/database";
const LOCAL = "/media/reels/flower-cc0-v1.mp4";
const LEGACY =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const KEY = "reel_demo_same_origin_media_v1";

test("ships the identical original demo with a stable hash, video MIME and seek/range support", async () => {
  const bytes = fs.readFileSync(`client/public${LOCAL}`);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451"
  );
  const app = express().use(express.static("client/public"));
  const result = await request(app).get(LOCAL).set("Range", "bytes=0-127");
  expect(result.status).toBe(206);
  expect(result.headers["content-type"]).toContain("video/mp4");
  expect(result.headers["content-range"]).toBe(`bytes 0-127/${bytes.length}`);
  expect(result.body).toEqual(bytes.subarray(0, 128));
});

test("repairs only the exact legacy seed URL once, preserving custom CRM content and metadata", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-local-"));
  const filename = path.join(dir, "db.sqlite");
  let db = new QatafoDatabase(filename);
  try {
    expect(
      db.get<any>("SELECT video_url FROM reels WHERE id=?", "reel_demo_01")
        .video_url
    ).toBe(LOCAL);
    db.run("DELETE FROM applied_data_migrations WHERE key=?", KEY);
    db.run(
      "UPDATE reels SET video_url=?,title=?,views=17,likes=3 WHERE id=?",
      LEGACY,
      "Owner-edited title",
      "reel_demo_01"
    );
    const before = db.get<any>(
      "SELECT * FROM reels WHERE id=?",
      "reel_demo_01"
    );
    db.close();
    db = new QatafoDatabase(filename);
    expect(
      db.get<any>("SELECT * FROM reels WHERE id=?", "reel_demo_01")
    ).toEqual({ ...before, video_url: LOCAL });
    db.run("DELETE FROM applied_data_migrations WHERE key=?", KEY);
    db.run(
      "UPDATE reels SET video_url=? WHERE id=?",
      "/uploads/reels/owner-authored.mp4",
      "reel_demo_01"
    );
    db.close();
    db = new QatafoDatabase(filename);
    expect(
      db.get<any>("SELECT video_url FROM reels WHERE id=?", "reel_demo_01")
        .video_url
    ).toBe("/uploads/reels/owner-authored.mp4");
    // A later owner change stays untouched on the next boot, even if it uses the legacy URL.
    db.run("UPDATE reels SET video_url=? WHERE id=?", LEGACY, "reel_demo_01");
    db.close();
    db = new QatafoDatabase(filename);
    expect(
      db.get<any>("SELECT video_url FROM reels WHERE id=?", "reel_demo_01")
        .video_url
    ).toBe(LEGACY);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
