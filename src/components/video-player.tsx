"use client";

import { useState } from "react";
import type { Video } from "@/lib/video-feed";

export function VideoPlayer({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="video-card">
      <div className="video-window">
        {playing ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`} title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        ) : (
          <button className="video-facade group" type="button" onClick={() => setPlaying(true)} aria-label={`Смотреть: ${video.title}`}>
            {/* The iframe and its scripts load only after an explicit click. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} width={480} height={360} loading="lazy" alt="" className="video-thumbnail" />
            <span className="video-shade" />
            <span className="video-play" aria-hidden="true"><svg viewBox="0 0 68 48" fill="none"><rect width="68" height="48" rx="13" fill="currentColor" /><path d="m28 14 18 10-18 10V14Z" fill="white" /></svg></span>
            <span className="video-label">СМОТРЕТЬ НА YOUTUBE</span>
          </button>
        )}
      </div>
      <figcaption><a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-60">
        {video.title}<span className="sr-only"> (откроется в новой вкладке)</span>
      </a></figcaption>
    </figure>
  );
}
