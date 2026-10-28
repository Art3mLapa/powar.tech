import { XMLParser, XMLValidator } from "fast-xml-parser";

export type Video = { id: string; title: string; published?: string };
export const CHANNEL_URL = "https://www.youtube.com/@buildersc_production";
export const CHANNEL_ID = "UCvz6jkvM6whTM3q7lxvh4Yg";

// Verified on the channel's Videos tab on 2026-10-28; used only when RSS is unreachable.
export const VIDEO_SNAPSHOT: Video[] = [
  { id: "B_Oq1AT6rOM", title: "STALZONE НАИЗНАНКУ: Структура файлов игры" },
  { id: "197KI4NMJyg", title: "солянка вылазов с дикого севера и не ток (подземка, старый лим, операции)" },
];

export function parseVideoFeed(xml: string): Video[] {
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Invalid YouTube RSS response");
  const document = new XMLParser({ processEntities: true, parseTagValue: false }).parse(xml);
  const entries: unknown = document?.feed?.entry;
  const list: unknown[] = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const videos: Video[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = entry["yt:videoId"];
    const title = entry.title;
    const published = entry.published;
    if (typeof id !== "string" || !/^[\w-]{11}$/.test(id) || typeof title !== "string" || !title.trim() || seen.has(id)) continue;
    seen.add(id);
    videos.push({ id, title: title.trim().slice(0, 300), ...(typeof published === "string" && Number.isFinite(Date.parse(published)) ? { published } : {}) });
  }
  return videos.sort((a, b) => (Date.parse(b.published ?? "") || 0) - (Date.parse(a.published ?? "") || 0)).slice(0, 2);
}
