import { EditorView } from '@/views/workspace/editor-view'
export const metadata = { robots: { index: false, follow: false } }
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	return <EditorView id={id} />
}
