import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { AvatarDef } from '@shared/types'
import { AvatarPicker } from './AvatarPicker'
import { PixelAvatar } from './PixelAvatar'
import { Button } from './ui'

interface Props {
  value: AvatarDef
  /** Avatares gerados nesta edição (continuam disponíveis se o modal for reaberto). */
  generated: AvatarDef[]
  onGenerate(avatar: AvatarDef): void
  onConfirm(avatar: AvatarDef): void
  onClose(): void
}

/** Janela para escolher o avatar: prévia animada, sortear, gerar novo e a grade com todos. */
export function AvatarPickerModal({ value, generated, onGenerate, onConfirm, onClose }: Props) {
  useLanguage()
  const [choice, setChoice] = useState(value)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr('Escolher avatar')}
        className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-card border border-line bg-page shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-[16px] font-semibold">{tr('Escolher avatar')}</p>
          <button onClick={onClose} aria-label={tr('Fechar')} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="mb-5 flex items-center gap-5">
            <div className="flex size-[104px] shrink-0 items-center justify-center rounded-card bg-sidebar">
              <PixelAvatar avatar={choice} size={72} mood="happy" />
            </div>
            <div className="min-w-0">
              <p className="text-[18px] font-medium tracking-[-0.01em]">{choice.name}</p>
              <p className="text-[13px] text-muted">{choice.personality}</p>
            </div>
          </div>
          <AvatarPicker value={choice} onChange={setChoice} generated={generated} onGenerate={onGenerate} />
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose}>{tr('Cancelar')}</Button>
          <Button variant="primary" onClick={() => onConfirm(choice)}>{tr('Usar este avatar')}</Button>
        </div>
      </div>
    </div>
  )
}
