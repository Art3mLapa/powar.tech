'use client'

import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
function subscribe(notify: () => void) {
	const media = window.matchMedia(query)
	media.addEventListener('change', notify)
	return () => media.removeEventListener('change', notify)
}
const getSnapshot = () => window.matchMedia(query).matches
const getServerSnapshot = () => false

// The first hydration render must match the server before reading browser preferences.
export function useReducedMotionPreference() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
