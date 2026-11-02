export const IDLE_DELAY_MS = 15_000
export const FRAME_START = 0.09
export const FRAME_END = 0.86
export const MAX_DECODED_FRAMES = 7

export function segmentProgress(
	progress: number,
	start: number,
	end: number
): number {
	return Math.max(0, Math.min(1, (progress - start) / (end - start)))
}

export function frameIndex(progress: number, count: number): number {
	if (count < 2 || !Number.isFinite(progress)) return 0
	const normalized = segmentProgress(progress, FRAME_START, FRAME_END)
	return Math.round(normalized * (count - 1))
}

export function frameWindow(
	index: number,
	count: number,
	direction: number
): number[] {
	const step = direction < 0 ? -1 : 1
	return [
		index,
		index + step,
		index - step,
		index + 2 * step,
		index - 2 * step,
	].filter((value) => value >= 0 && value < count)
}

export function frameDockFactor(
	index: number,
	bottomEdges: readonly number[],
	height: number
): number {
	const finalBottom = bottomEdges.at(-1)
	if (
		!Number.isFinite(index) ||
		finalBottom === undefined ||
		height <= finalBottom
	)
		return 0
	const bottom =
		bottomEdges[
			Math.max(0, Math.min(bottomEdges.length - 1, Math.round(index)))
		]
	return segmentProgress(bottom, finalBottom, height)
}
