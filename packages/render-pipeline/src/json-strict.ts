import type { DiagnosticsEntry } from '@bscp/render-contracts'

export interface StrictJsonResult<T = unknown> {
	data: T
	diagnostics: DiagnosticsEntry[]
}

const MAX_DEPTH = 128

class JsonParser {
	position = 0
	line = 1
	constructor(
		public readonly text: string,
		public readonly source: string,
		public readonly diagnostics: DiagnosticsEntry[]
	) {}

	error(message: string): never {
		throw new SyntaxError(
			`${this.source}: JSON syntax error at line ${this.line}: ${message}`
		)
	}

	anomaly(code: string, message: string) {
		this.diagnostics.push({
			severity: 'info',
			code,
			message,
			source: this.source,
			line: this.line,
		})
	}

	peek(offset = 0): string {
		return this.text[this.position + offset] ?? ''
	}

	advance(): string {
		const char = this.text[this.position]
		if (char === '\n') this.line++
		this.position++
		return char
	}

	comment(): boolean {
		if (this.text.startsWith('//', this.position)) {
			this.anomaly(
				'json.comment',
				`line comment unsupported by strict JSON consumers`
			)
			while (
				this.position < this.text.length &&
				!'\n\r'.includes(this.text[this.position])
			)
				this.advance()
			return true
		}
		if (this.text.startsWith('/*', this.position)) {
			this.anomaly(
				'json.comment',
				`block comment unsupported by strict JSON consumers`
			)
			while (
				this.position < this.text.length &&
				!this.text.startsWith('*/', this.position)
			)
				this.advance()
			if (this.text.startsWith('*/', this.position)) {
				this.advance()
				this.advance()
				return true
			}
			this.error('unterminated block comment')
		}
		return false
	}

	blank() {
		for (;;) {
			while (
				this.position < this.text.length &&
				/^[ \t\r\n]/.test(this.text[this.position])
			)
				this.advance()
			if (!this.comment()) return
		}
	}

	string(): string {
		this.advance()
		let value = ''
		for (;;) {
			if (this.position >= this.text.length)
				this.error('unterminated string')
			const char = this.text[this.position]
			if (char === '"') {
				this.advance()
				return value
			}
			if (char === '\\') {
				this.advance()
				const escaped = this.text[this.position]
				this.advance()
				if (escaped === 'n') value += '\n'
				else if (escaped === 't') value += '\t'
				else if (escaped === 'r') value += '\r'
				else if (escaped === 'b') value += '\b'
				else if (escaped === 'f') value += '\f'
				else if (escaped === '"' || escaped === '\\' || escaped === '/')
					value += escaped
				else if (escaped === 'u') {
					const hex = this.text.slice(
						this.position,
						this.position + 4
					)
					if (!/^[0-9a-fA-F]{4}$/.test(hex))
						this.error('bad unicode escaped')
					value += String.fromCharCode(Number.parseInt(hex, 16))
					this.position += 4
				} else this.error(`unsupported escaped: ${escaped}`)
				continue
			}
			if (char < ' ') this.error('control character in string literal')
			value += char
			this.advance()
		}
	}

	number(): number {
		const start = this.position
		while (
			this.position < this.text.length &&
			/^[0-9+\-.eE]/.test(this.text[this.position])
		)
			this.advance()
		const token = this.text.slice(start, this.position)
		if (!/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(token))
			this.error(`bad numeric token ${token}`)
		return Number(token)
	}

	value(depth: number): unknown {
		if (depth > MAX_DEPTH) this.error(`nesting exceeds ${MAX_DEPTH} levels`)
		this.blank()
		const char = this.peek()
		if (char === '{') return this.object(depth)
		if (char === '[') return this.array(depth)
		if (char === '"') return this.string()
		if (char === '-' || /^[0-9]/.test(char)) return this.number()
		for (const word of ['true', 'false', 'null']) {
			if (this.text.startsWith(word, this.position)) {
				for (let index = 0; index < word.length; index++) this.advance()
				return word === 'null' ? null : word === 'true'
			}
		}
		this.error(`unexpected token ${char || '<eof>'}`)
	}

	object(depth: number): unknown {
		this.advance()
		const result: Record<string, unknown> = {}
		const keys = new Set<string>()
		let comma = false
		for (;;) {
			this.blank()
			if (this.peek() === '}') {
				if (comma) {
					this.anomaly(
						'json.trailing-comma',
						`trailing comma in object near line ${this.line}`
					)
					this.advance()
					return result
				}
				this.advance()
				return result
			}
			if (comma) {
				this.anomaly(
					'json.double-comma',
					`double comma in object near line ${this.line}`
				)
				comma = false
			}
			if (this.peek() === ',')
				this.error(`unexpected comma near line ${this.line}`)
			if (this.peek() !== '"')
				this.error(`expected string key or '}' near line ${this.line}`)
			const key = this.string()
			if (keys.has(key))
				this.anomaly(
					'json.duplicate-key',
					`duplicate object key ${key} overwrites earlier value`
				)
			keys.add(key)
			this.blank()
			if (this.peek() !== ':') this.error(`expected ':' after key ${key}`)
			this.advance()
			result[key] = this.value(depth + 1)
			this.blank()
			if (this.peek() === ',') {
				this.advance()
				comma = true
			}
		}
	}

	array(depth: number): unknown {
		this.advance()
		const result: unknown[] = []
		for (;;) {
			this.blank()
			if (this.peek() === ']') {
				this.advance()
				return result
			}
			result.push(this.value(depth + 1))
			this.blank()
			if (this.peek() === ',') {
				this.advance()
			}
		}
	}
}

export function parseStrictJsonResource(
	text: string,
	source: string,
	diagnostics: DiagnosticsEntry[],
	byteLimit = 8_388_608
): unknown {
	if (text.length > byteLimit)
		throw new Error(`${source}: JSON input exceeds ${byteLimit} bytes`)
	const parser = new JsonParser(text, source, diagnostics)
	const data = parser.value(0)
	parser.blank()
	if (parser.position !== text.length)
		parser.error('unexpected content after top-level value')
	return data
}

export function parseStrictJson(
	text: string,
	source: string,
	byteLimit = 8_388_608
): StrictJsonResult {
	if (text.length > byteLimit)
		throw new Error(`${source}: JSON input exceeds ${byteLimit} bytes`)
	const diagnostics: DiagnosticsEntry[] = []
	const parser = new JsonParser(text, source, diagnostics)
	const data = parser.value(0)
	parser.blank()
	if (parser.position !== text.length)
		parser.error('unexpected content after top-level value')
	return { data, diagnostics }
}
