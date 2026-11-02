import { AdminView } from '@/views/admin/admin-view'
export const metadata = {
	robots: { index: false, follow: false },
	title: 'Администрирование — Билдерс',
}
export default function Page() {
	return <AdminView />
}
