import { ChevronDown, Sparkles } from 'lucide-react'
import type { ProviderModel } from '@shared/types'

/** Nome legível de um modelo (ou "Padrão"). */
export function modelLabel(models: ProviderModel[], id?: string): string {
  return models.find((m) => m.id === (id ?? 'default'))?.label ?? id ?? 'Padrão'
}

/** Seletor de modelo em formato de chip, para o campo de mensagem. */
export function ModelSelect({
  models,
  value,
  onChange,
  disabled
}: {
  models: ProviderModel[]
  value?: string
  onChange(model: string): void
  disabled?: boolean
}) {
  return (
    <label
      className="relative inline-flex items-center"
      title={models.find((m) => m.id === (value ?? 'default'))?.description}
    >
      <Sparkles size={13} className="pointer-events-none absolute left-3 text-muted" />
      <select
        value={value ?? 'default'}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 appearance-none rounded-full border border-line bg-card pr-8 pl-8 text-[13px] font-medium text-fg-2 outline-none hover:bg-hover disabled:opacity-50"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  )
}
