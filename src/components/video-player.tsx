'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import type { Video } from '@/lib/video-feed'

export function VideoPlayer({ video }: { video: Video }) {
	const [playing, setPlaying] = useState(false)
	return (
		<figure className="video-card">
			<div className="video-window">
				{playing ? (
					<iframe
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						allowFullScreen
						referrerPolicy="strict-origin-when-cross-origin"
						src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
						title={video.title}
					/>
				) : (
					<button
						aria-label={`Смотреть: ${video.title}`}
						className="video-facade group"
						onClick={() => setPlaying(true)}
						type="button"
					>
						<Image
							alt=""
							className="video-thumbnail"
							height={360}
							loading="lazy"
							src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
							width={480}
						/>
						<span className="video-shade" />
						<span aria-hidden="true" className="video-play">
							<svg aria-label='youtube' fill="none" viewBox="0 0 68 48">
								<rect
									fill="currentColor"
									height="48"
									rx="13"
									width="68"
								/>
								<path d="m28 14 18 10-18 10V14Z" fill="white" />
							</svg>
						</span>
						<span className="video-label">СМОТРЕТЬ НА YOUTUBE</span>
					</button>
				)}
			</div>
			<figcaption>
				<Link
					className="transition-opacity hover:opacity-60"
					href={`https://www.youtube.com/watch?v=${video.id}`}
					rel="noopener noreferrer"
					target="_blank"
				>
					{video.title}
					<span className="sr-only">
						{' '}
						(откроется в новой вкладке)
					</span>
				</Link>
			</figcaption>
		</figure>
	)
}
