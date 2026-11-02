import { WorkspaceView } from '@/views/workspace/workspace-view'
export const metadata = {
	robots: { index: false, follow: false },
	title: 'Редакция — Билдерс',
}
export default function Page() {
	return <WorkspaceView />
}
