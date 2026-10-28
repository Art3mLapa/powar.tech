import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const origin = new URL(process.argv[2] ?? "http://localhost:3000");
const response = await fetch(origin, { signal: AbortSignal.timeout(10_000) });
assert.equal(response.status, 200, "The home page must be available");
const html = await response.text();
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1].replaceAll("&amp;", "&"))
  .filter((path) => /^\/(?:_next\/static|images|frames)\//.test(path)))];
assert.ok(assets.some((path) => /\.js(?:\?|$)/.test(path)), "Client scripts are required for scroll and video controls");
const manifest = JSON.parse(await readFile(new URL("../src/lib/frame-manifest.json", import.meta.url), "utf8"));
for (const path of new Set([...assets, ...manifest.frames])) {
  const asset = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000) });
  assert.equal(asset.status, 200, `Missing asset: ${path}`);
  assert.ok(!asset.headers.get("content-type")?.includes("text/html"), `HTML returned instead of asset: ${path}`);
  assert.ok((await asset.arrayBuffer()).byteLength > 0, `Empty asset: ${path}`);
}
console.log(`Delivery OK: home page, client chunks, styles, fonts, images, and ${manifest.frames.length} frames`);
