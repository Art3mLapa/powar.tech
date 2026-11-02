'use client'

import { useRef, useState } from 'react'

function formatTime(seconds: number) {
	const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
	const minutes = Math.floor(total / 60)
	return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

export function AudioEmbed({ src, title }: { src: string; title: string }) {
	const audioRef = useRef<HTMLAudioElement>(null)
	const [playing, setPlaying] = useState(false)
	const [current, setCurrent] = useState(0)
	const [duration, setDuration] = useState<number | null>(null)

	function toggle() {
		const audio = audioRef.current
		if (!audio) return
		if (playing) {
			audio.pause()
		} else {
			void audio.play()
		}
	}

	const progress =
		duration && duration > 0
			? `${Math.min(100, (current / duration) * 100)}%`
			: '0%'
	const time =
		playing || current > 0
			? formatTime(current)
			: duration == null
				? '--:--'
				: formatTime(duration)

	return (
		<figure className="article-audio-figure">
			{/* biome-ignore lint/a11y/useMediaCaption: аудио-вложение без диалоговой дорожки — титры (captions) неприменимы */}
			<audio
				className="hidden"
				onEnded={() => {
					setPlaying(false)
					setCurrent(0)
				}}
				onLoadedMetadata={() =>
					setDuration(audioRef.current?.duration ?? null)
				}
				onPause={() => setPlaying(false)}
				onPlay={() => setPlaying(true)}
				onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
				preload="metadata"
				ref={audioRef}
				src={src}
			/>
			<button
				aria-label={playing ? `Пауза: ${title}` : `Прослушать: ${title}`}
				className="article-audio-toggle"
				onClick={toggle}
				type="button"
			>
				{playing ? (
					<svg aria-hidden="true" viewBox="0 0 12 12">
						<rect height="12" rx="1.5" width="3.4" x="0.6" y="0" />
						<rect height="12" rx="1.5" width="3.4" x="8" y="0" />
					</svg>
				) : (
					<svg aria-hidden="true" viewBox="0 0 12 12">
						<path d="M1.6 0.6 11 6 1.6 11.4Z" />
					</svg>
				)}
			</button>
			<span className="article-audio-title">{title}</span>
			<span className="article-audio-time">{time}</span>
			<span aria-hidden="true" className="article-audio-track">
				<span className="article-audio-bar" style={{ width: progress }} />
			</span>
			<figcaption className="sr-only">{title}</figcaption>
		</figure>
	)
}
