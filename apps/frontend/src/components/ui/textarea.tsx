import { forwardRef, type TextareaHTMLAttributes } from 'react'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
	({ className = '', ...props }, ref) => (
		<textarea
			className={`border-border-default bg-surface-raised text-foreground placeholder:text-faint focus-visible:border-accent focus-visible:ring-accent/25 min-h-24 w-full min-w-0 resize-y rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
			ref={ref}
			{...props}
		/>
	)
)
Textarea.displayName = 'UI.Textarea'
