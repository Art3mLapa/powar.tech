import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const source = resolve(process.argv[2] ?? "C:/Users/artem/Desktop/powar.tech/src/frames/1_builder");
const output = resolve("public/frames/builder");
const files = (await readdir(source)).filter((file) => /\.(png|webp|jpe?g)$/i.test(file)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
if (files.length < 2) throw new Error(`At least two animation frames required: ${source}`);
await mkdir(output, { recursive: true });
await mkdir(resolve("src/lib"), { recursive: true });

const frames = [];
const bottomEdges = [];
const alphaCutoff = 8;
let bytes = 0;
for (const file of files) {
  // Fixed canvas: cropping individual alpha bounds would make the object jump.
  const resized = sharp(await readFile(resolve(source, file)))
    .resize(1280, 720, { fit: "contain", background: "#00000000" })
    .ensureAlpha();
  const { data: alpha, info } = await resized.clone().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  let bottom = 0;
  for (let y = info.height - 1; y >= 0 && !bottom; y--) {
    const row = alpha.subarray(y * info.width, (y + 1) * info.width);
    if (row.some((value) => value > alphaCutoff)) bottom = y + 1;
  }
  bottomEdges.push(bottom);
  const buffer = await resized.webp({ quality: 84, alphaQuality: 90, effort: 5 }).toBuffer();
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 10);
  const name = `${String(frames.length).padStart(3, "0")}-${hash}.webp`;
  await writeFile(resolve(output, name), buffer);
  frames.push(`/frames/builder/${name}`);
  bytes += buffer.length;
}
await writeFile(resolve("src/lib/frame-manifest.json"), `${JSON.stringify({ width: 1280, height: 720, frames, bottomEdges }, null, 2)}\n`);
console.log(`${frames.length} frames · ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
