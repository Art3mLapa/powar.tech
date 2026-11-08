import { AdminFilesView } from '@/views/admin/files-view'

export const metadata = {
	robots: { index: false, follow: false },
	title: 'Файлы — Билдерс',
}

export default function Page() {
	return <AdminFilesView />
}
