'use server'

import { CHANNEL_ID, parseVideoFeed, VIDEO_SNAPSHOT } from './video-feed'

export async function getLatestVideos() {
	try {
		const response = await fetch(
			`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
			{
				next: { revalidate: 3600 },
				signal: AbortSignal.timeout(8_000),
				headers: { Accept: 'application/atom+xml' },
			}
		)
		if (!response.ok) throw new Error(`YouTube RSS HTTP ${response.status}`)
		const videos = parseVideoFeed(await response.text())
		if (videos.length !== 2)
			throw new Error('YouTube RSS returned fewer than two videos')
		return videos
	} catch (error) {
		console.warn(
			'[youtube] RSS unavailable; serving verified channel snapshot.',
			error instanceof Error ? error.message : error
		)
		return VIDEO_SNAPSHOT
	}
}
