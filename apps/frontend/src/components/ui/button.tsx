import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
	primary:
		'border-transparent bg-foreground text-background hover:bg-white/85',
	secondary:
		'border-border-default bg-surface-raised text-foreground hover:border-foreground/60',
	quiet: 'border-transparent bg-transparent text-muted hover:text-foreground',
	danger: 'border-red-400/40 bg-red-950/40 text-red-200 hover:border-red-300',
}

export function Button({
	className = '',
	variant = 'secondary',
	type = 'button',
	...props
}: ButtonProps) {
	return (
		<button
			className={`focus-visible:outline-accent inline-flex min-h-10 items-center justify-center rounded-sm border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
			type={type}
			{...props}
		/>
	)
}

export function buttonClassName(
	variant: ButtonVariant = 'secondary',
	className = ''
) {
	return `inline-flex min-h-10 items-center justify-center rounded-sm border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent ${variants[variant]} ${className}`
}
