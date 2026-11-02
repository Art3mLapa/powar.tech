import { PatchView } from '@/views/patches/patches-view'
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	return <PatchView id={id} />
}
