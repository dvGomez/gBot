import { t as tr, useLanguage } from '@/i18n'
import { Check, Dices, Sparkles } from 'lucide-react'
import type { AvatarDef } from '@shared/types'
import { AVATARS } from '@/avatars/sprites'
import { generateAvatar } from '@/avatars/parts'
import { cn } from '@/lib/cn'
import { PixelAvatar } from './PixelAvatar'
import { Button } from './ui'

interface Props {
  value: AvatarDef
  onChange(avatar: AvatarDef): void
  /** Avatares gerados nesta edição, mostrados antes dos prontos. */
  generated: AvatarDef[]
  onGenerate(avatar: AvatarDef): void
}

/** Grade com os 20 avatares prontos + os gerados, com botões para sortear ou gerar um novo. */
export function AvatarPicker({ value, onChange, generated, onGenerate }: Props) {
  useLanguage()
  const all = [...generated, ...AVATARS]
  return (
    <div>
      <div className="flex gap-2">
        <Button onClick={() => onChange(AVATARS[Math.floor(Math.random() * AVATARS.length)])} type="button">
          <Dices size={14} />{tr('Sortear')}</Button>
        <Button
          type="button"
          onClick={() => {
            const a = generateAvatar()
            onGenerate(a)
            onChange(a)
          }}
        >
          <Sparkles size={14} />{tr('Gerar novo')}</Button>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-2 xl:grid-cols-8">
        {all.map((a, i) => {
          const selected = a.id === value.id
          return (
            <button
              key={a.id}
              type="button"
              title={a.name}
              onClick={() => onChange(a)}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-tile border transition-colors hover:bg-hover',
                selected ? 'border-primary bg-hover' : 'border-line'
              )}
            >
              {selected && (
                <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-on-primary">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
              <PixelAvatar avatar={a} size={36} seed={i} animated={selected} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
