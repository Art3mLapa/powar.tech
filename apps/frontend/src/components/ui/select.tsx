import type { SelectHTMLAttributes } from 'react'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function Select({ className = '', ...props }: SelectProps) {
	return (
		<select
			className={`border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-11 w-full min-w-0 rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
			{...props}
		/>
	)
}
