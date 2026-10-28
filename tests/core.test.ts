import assert from "node:assert/strict";
import test from "node:test";
import { frameDockFactor, frameIndex, frameWindow, segmentProgress, FRAME_START, FRAME_END, IDLE_DELAY_MS } from "../src/lib/timeline.ts";
import { parseVideoFeed, VIDEO_SNAPSHOT } from "../src/lib/video-feed.ts";
import manifest from "../src/lib/frame-manifest.json" with { type: "json" };
import { access } from "node:fs/promises";

test("frame timeline is bounded, reversible, and holds the last frame before unpinning", () => {
  assert.equal(IDLE_DELAY_MS, 15_000);
  assert.equal(segmentProgress(0, 0.025, 0.15), 0);
  assert.equal(segmentProgress(0.8, 0.025, 0.15), 1);
  assert.equal(segmentProgress(0.1, 0.04, 0.15), (0.1 - 0.04) / (0.15 - 0.04));
  assert.equal(frameIndex(-1, 41), 0);
  assert.equal(frameIndex(FRAME_START, 41), 0);
  assert.equal(frameIndex((FRAME_START + FRAME_END) / 2, 41), 20);
  assert.equal(frameIndex(FRAME_END, 41), 40);
  assert.equal(frameIndex(1, 41), 40);
  assert.equal(frameIndex(Number.NaN, 41), 0);
  const forward = Array.from({ length: 101 }, (_, i) => frameIndex(i / 100, 41));
  const reverse = Array.from({ length: 101 }, (_, i) => frameIndex((100 - i) / 100, 41));
  assert.deepEqual(reverse, forward.toReversed());
  assert.ok(forward.every((value, i) => i === 0 || value >= forward[i - 1]));
  assert.deepEqual(frameWindow(0, 41, 1), [0, 1, 2]);
  assert.deepEqual(frameWindow(40, 41, -1), [40, 39, 38]);
  assert.deepEqual(frameWindow(20, 41, -1), [20, 19, 21, 18, 22]);
});

test("every manifest frame exists and is an optimized WebP", async () => {
  assert.equal(manifest.frames.length, 41);
  for (const frame of manifest.frames) {
    assert.match(frame, /^\/frames\/builder\/\d{3}-[a-f0-9]{10}\.webp$/);
    await access(new URL(`../public${frame}`, import.meta.url));
  }
});

test("cropped frames touch the viewport bottom at desktop, mobile, and browser zoom sizes", () => {
  assert.equal(manifest.bottomEdges.length, manifest.frames.length);
  assert.ok(manifest.bottomEdges.every((edge) => edge > 0 && edge <= manifest.height));
  const clipped = manifest.bottomEdges.flatMap((edge, i) => edge === manifest.height ? [i] : []);
  assert.equal(clipped.length, 21);
  for (const [vw, vh] of [[1270, 720], [390, 844], [1910, 739], [3440, 1358]]) {
    const artHeight = Math.min(1500, 1.5 * vh, 2 * vw) * manifest.height / manifest.width;
    const gap = (vh - artHeight) / 2;
    assert.ok(gap > 0);
    for (const index of clipped) {
      const factor = frameDockFactor(index, manifest.bottomEdges, manifest.height);
      assert.equal(factor, 1);
      const canvasBottom = gap + gap * factor + artHeight;
      assert.ok(Math.abs(canvasBottom - vh) < 0.001, `Gap below frame ${index} at ${vw}x${vh}`);
    }
  }
  const factors = manifest.frames.map((_, i) => frameDockFactor(i, manifest.bottomEdges, manifest.height));
  assert.equal(factors.at(-1), 0);
  assert.ok(factors[21] > 0 && factors[21] < 1);
  assert.ok(factors.every((factor, i) => factor >= 0 && factor <= 1 && (i === 0 || factor <= factors[i - 1])));
  assert.deepEqual(factors.toReversed(), manifest.frames.map((_, i) => frameDockFactor(manifest.frames.length - 1 - i, manifest.bottomEdges, manifest.height)));
  assert.equal(frameDockFactor(0, [], 720), 0);
  assert.equal(frameDockFactor(0, [720], 720), 0);
  assert.equal(frameDockFactor(Number.NaN, [720, 635], 720), 0);
});

test("RSS selects the latest two unique valid videos and decodes title entities", () => {
  const entry = (id: string, date: string, title = "Hello &amp; zone") => `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${date}</published></entry>`;
  const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">${entry("B_Oq1AT6rOM", "2026-01-01")}${entry("197KI4NMJyg", "2026-10-28")}${entry("wT38KMH1QgM", "2026-03-01")}${entry("197KI4NMJyg", "2026-10-28")}${entry("bad", "2026-11-01")}</feed>`;
  assert.deepEqual(parseVideoFeed(xml).map((video) => video.id), ["197KI4NMJyg", "wT38KMH1QgM"]);
  assert.equal(parseVideoFeed(xml)[0].title, "Hello & zone");
  assert.equal(parseVideoFeed(`<feed>${entry("B_Oq1AT6rOM", "2026-01-01")}</feed>`).length, 1);
  assert.deepEqual(parseVideoFeed("<feed/>"), []);
  assert.throws(() => parseVideoFeed("not xml"));
  assert.throws(() => parseVideoFeed('<!DOCTYPE foo [<!ENTITY x "bad">]><feed/>'));
  assert.throws(() => parseVideoFeed("x".repeat(1_000_001)));
  assert.equal(VIDEO_SNAPSHOT.length, 2);
});
