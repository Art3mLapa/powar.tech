'use client'

import Image from 'next/image'
import { useState } from 'react'

export function VideoEmbed({ id, title }: { id: string; title: string }) {
	const [playing, setPlaying] = useState(false)
	return (
		<figure className="article-video-figure">
			{playing ? (
				<iframe
					allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
					allowFullScreen
					className="article-video-iframe"
					src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
					title={title || 'Смотреть видео'}
				/>
			) : (
				<button
					aria-label={`Смотреть: ${title || 'видео'}`}
					className="article-video"
					onClick={() => setPlaying(true)}
					type="button"
				>
					<Image
						alt=""
						className="article-video-thumb"
						fill
						loading="lazy"
						sizes="(max-width: 614px) 100vw, 590px"
						src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
					/>
					<span aria-hidden="true" className="article-video-shade" />
					<span aria-hidden="true" className="article-video-play" />
				</button>
			)}
			{title ? (
				<figcaption className="article-video-caption">{title}</figcaption>
			) : null}
		</figure>
	)
}
