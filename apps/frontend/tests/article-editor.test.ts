import assert from 'node:assert/strict'
import test from 'node:test'
import {
	continueList,
	indentSelection,
	parseArticleTags,
	wrapSelection,
} from '../src/lib/article-editor.ts'
import {
	type MarkdownNode,
	remarkCallouts,
} from '../src/lib/article-markdown.ts'

test('formatting preserves surrounding text and selects inserted content', () => {
	assert.deepEqual(wrapSelection('one two three', 4, 7, '**', '**'), {
		value: 'one **two** three',
		start: 6,
		end: 9,
	})
	assert.deepEqual(wrapSelection('', 0, 0, '**', '**'), {
		value: '**Текст**',
		start: 2,
		end: 7,
	})
	assert.deepEqual(wrapSelection('ab', 1, 1, '![image](/image)', '', ''), {
		value: 'a![image](/image)b',
		start: 17,
		end: 17,
	})
})

test('indentation and outdentation preserve multiline selection and trailing lines', () => {
	const source = 'first\nsecond\nthird'
	const indented = indentSelection(source, 0, 13)
	assert.equal(indented.value, '  first\n  second\nthird')
	assert.equal(indented.start, 2)
	assert.equal(indented.end, 17)
	assert.deepEqual(indentSelection(indented.value, 0, indented.end, true), {
		value: source,
		start: 0,
		end: 13,
	})
	assert.equal(indentSelection('\nhello', 0, 1).value, '  \nhello')
	assert.equal(indentSelection('plain', 0, 5, true).value, 'plain')
})

test('list continuation increments ordered lists and resets task checkbox', () => {
	for (const [source, expected] of [
		['- item', '- item\n- '],
		['  9. item', '  9. item\n  10. '],
		['- [x] done', '- [x] done\n- [ ] '],
	]) {
		const result = continueList(source, source.length)
		assert.equal(result?.value, expected)
		assert.equal(result?.start, expected.length)
		assert.equal(result?.end, expected.length)
	}
	assert.deepEqual(continueList('first\n- ', 8), {
		value: 'first\n',
		start: 6,
		end: 6,
	})
	assert.equal(continueList('paragraph', 9), null)
})

test('tags are trimmed, deduplicated, and empty tags are excluded', () => {
	assert.deepEqual(parseArticleTags(' Зона, новости,,Зона,  '), [
		'Зона',
		'новости',
	])
})

test('only whitelisted container callouts receive safe output elements', () => {
	const allowed = ['note', 'warning', 'tip', 'info'].map((name) => ({
		type: 'containerDirective',
		name,
		data: { hName: 'script', hProperties: { onclick: 'alert(1)' } },
	}))
	const unknown: MarkdownNode = { type: 'containerDirective', name: 'script' }
	const inline: MarkdownNode = { type: 'textDirective', name: 'note' }
	const tree: MarkdownNode = {
		type: 'root',
		children: [...allowed, unknown, inline],
	}
	remarkCallouts()(tree)
	for (const node of allowed) {
		assert.deepEqual(node.data, {
			hName: 'aside',
			hProperties: { className: `callout callout-${node.name}` },
		})
	}
	assert.equal(unknown.data, undefined)
	assert.equal(inline.data, undefined)
})
