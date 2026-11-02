import { AuthView } from '@/views/auth/auth-view'
export const metadata = {
	robots: { index: false, follow: false },
	referrer: 'no-referrer' as const,
}
export default function Page() {
	return <AuthView registration />
}
