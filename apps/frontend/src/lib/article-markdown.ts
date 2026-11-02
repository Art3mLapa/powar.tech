export type MarkdownNode = {
	type: string
	name?: string
	children?: MarkdownNode[]
	data?: { hName?: string; hProperties?: Record<string, string> }
}

const calloutNames = new Set(['note', 'warning', 'tip', 'info'])

export function remarkCallouts() {
	return (tree: MarkdownNode) => {
		function visit(node: MarkdownNode) {
			if (node.type === 'containerDirective') {
				if (calloutNames.has(node.name ?? '')) {
					node.data = {
						hName: 'aside',
						hProperties: { className: `callout callout-${node.name}` },
					}
				} else if (node.name === 'collage') {
					node.children = (node.children ?? []).filter(
						(child) =>
							child.type === 'paragraph' &&
							(child.children ?? []).some((item) => item.type === 'image')
					)
					node.data = {
						hName: 'figure',
						hProperties: { className: 'article-collage' },
					}
				}
			}
			for (const child of node.children ?? []) visit(child)
		}
		visit(tree)
	}
}
