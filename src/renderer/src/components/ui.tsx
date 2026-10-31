import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ProviderStatus } from '@shared/types'
import { cn } from '@/lib/cn'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-card border border-line bg-card', className)}>{children}</div>
}

export function IconTile({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-tile',
        primary ? 'bg-primary text-on-primary' : 'bg-tile text-fg'
      )}
    >
      {children}
    </div>
  )
}

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors disabled:opacity-40',
        variant === 'primary' && 'bg-primary text-on-primary hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-card text-fg-2 hover:bg-hover',
        variant === 'ghost' && 'text-fg-2 hover:bg-hover',
        className
      )}
    />
  )
}

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        'h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        active ? 'border-primary bg-primary text-on-primary' : 'border-line bg-card text-fg-2 hover:bg-hover',
        className
      )}
    />
  )
}

const STATUS: Record<ProviderStatus, { label: string; dot: string }> = {
  ready: { label: 'Pronto', dot: 'bg-success' },
  'not-configured': { label: 'Configurar', dot: 'bg-warning' },
  unavailable: { label: 'Indisponível', dot: 'bg-danger' },
  'coming-soon': { label: 'Em breve', dot: 'bg-muted' }
}

export function StatusDot({ status }: { status: ProviderStatus }) {
  return <span className={cn('inline-block size-1.5 rounded-full', STATUS[status].dot)} />
}

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium text-fg-2">
      <StatusDot status={status} />
      {STATUS[status].label}
    </span>
  )
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div>
      {eyebrow && <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{eyebrow}</p>}
      <h1 className="mt-2 text-[36px] leading-tight font-medium tracking-[-0.03em] text-fg">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  action,
  children
}: {
  label: string
  hint?: string
  error?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <span className="flex items-end justify-between gap-3">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        {action}
      </span>
      <div className="mt-2">{children}</div>
      {error ? (
        <span className="mt-1.5 block text-[12px] text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[12px] text-muted">{hint}</span>
      )}
    </div>
  )
}

export const inputClass =
  'selectable w-full rounded-tile border border-line bg-card px-3.5 py-2.5 text-[14px] text-fg outline-none transition-colors placeholder:text-muted focus:border-muted/60'
