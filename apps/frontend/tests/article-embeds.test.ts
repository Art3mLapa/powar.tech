import assert from 'node:assert/strict'
import test from 'node:test'
import type { MarkdownNode } from '../src/lib/article-markdown.ts'
import { remarkCallouts } from '../src/lib/article-markdown.ts'
import {
	detectYouTubeVideoId,
	isAudioLink,
} from '../src/lib/article-embeds.ts'

test('collage directive keeps only paragraphs with images', () => {
	const collage: MarkdownNode = {
		type: 'containerDirective',
		name: 'collage',
		children: [
			{ type: 'paragraph', children: [{ type: 'image' }] },
			{ type: 'paragraph', children: [{ type: 'text' }] },
			{ type: 'heading', children: [{ type: 'image' }] },
		],
	}
	const tree: MarkdownNode = {
		type: 'root',
		children: [collage],
	}
	remarkCallouts()(tree)
	assert.deepEqual(collage.data, {
		hName: 'figure',
		hProperties: { className: 'article-collage' },
	})
	assert.deepEqual(collage.children, [
		{ type: 'paragraph', children: [{ type: 'image' }] },
	])
})

test('unknown directives still leave output unmodified', () => {
	const tree: MarkdownNode = {
		type: 'root',
		children: [
			{ type: 'containerDirective', name: 'collage' },
			{ type: 'containerDirective', name: 'mermaid' },
		],
	}
	remarkCallouts()(tree)
	const [first, second] = tree.children ?? []
	assert.deepEqual(first.data, {
		hName: 'figure',
		hProperties: { className: 'article-collage' },
	})
	assert.equal(second.data, undefined)
})

test('youtube video ids are detected only on known hosts and paths', () => {
	const expected = [
		['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['https://youtu.be/dQw4w9WgXcQ?t=3', 'dQw4w9WgXcQ'],
		['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['https://youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
	] as const
	for (const [href, id] of expected) {
		assert.deepEqual(detectYouTubeVideoId(href), { id })
	}
	for (const href of [
		'https://example.com/watch?v=dQw4w9WgXcQ',
		'https://youtu.be.evil.com/watch?v=dQw4w9WgXcQ',
		'https://www.youtube.com/playlist?list=dQw4w9WgXcQ',
		'https://youtu.be/',
		'not a url',
	]) {
		assert.equal(detectYouTubeVideoId(href), null)
	}
})

test('audio links are detected by extension', () => {
	for (const href of [
		'https://example.com/song.mp3',
		'https://example.com/files/voice.M4A',
		'https://example.com/book.ogg',
	]) {
		assert.equal(isAudioLink(href), true)
	}
	for (const href of [
		'https://example.com/song.mp4',
		'https://example.com/book',
	]) {
		assert.equal(isAudioLink(href), false)
	}
})
