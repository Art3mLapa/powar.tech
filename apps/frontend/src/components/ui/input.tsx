import { forwardRef, type InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ className = '', ...props }, ref) => (
		<input
			className={`border-border-default bg-surface-raised text-foreground placeholder:text-faint focus-visible:border-accent focus-visible:ring-accent/25 min-h-11 w-full min-w-0 rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
			ref={ref}
			{...props}
		/>
	)
)
Input.displayName = 'UI.Input'
