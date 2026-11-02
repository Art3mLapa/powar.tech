import Link from 'next/link'

const linkClassName =
	'py-2 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent'

export function ContentNav() {
	return (
		<nav
			aria-label="Основная навигация"
			className="border-border-default mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-5 sm:px-6"
		>
			<Link
				className="type-display text-foreground mr-auto text-3xl"
				href="/"
			>
				BSCP
			</Link>
			<Link className={linkClassName} href="/articles">
				Статьи
			</Link>
			<Link className={linkClassName} href="/patches">
				Патчи
			</Link>
			<Link className={linkClassName} href="/workspace">
				Редакция
			</Link>
		</nav>
	)
}
