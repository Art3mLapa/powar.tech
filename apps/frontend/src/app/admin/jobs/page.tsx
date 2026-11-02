import { JobsView } from '@/views/admin/jobs-view'
export const metadata = {
	robots: { index: false, follow: false },
	title: 'Задачи — Билдерс',
}
export default function Page() {
	return <JobsView />
}
