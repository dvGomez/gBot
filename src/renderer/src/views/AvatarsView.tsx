import { useState } from 'react'
import { Check } from 'lucide-react'
import type { AvatarMood } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Card, Chip, PageHeader } from '@/components/ui'
import { AVATARS, getAvatar, MOOD_LABELS } from '@/avatars/sprites'
import { cn } from '@/lib/cn'
import { useApp } from '@/state/app'

const MOODS = Object.keys(MOOD_LABELS) as AvatarMood[]

export function AvatarsView() {
  const app = useApp()
  const [preview, setPreview] = useState<AvatarMood>('idle')
  const current = getAvatar(app.avatarId)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <PageHeader eyebrow="Assistente" title="Avatares" subtitle="Escolha quem conversa com você. O avatar reage ao que o assistente está fazendo." />

      <Card className="mt-8 flex items-center gap-10 p-8">
        <div className="flex size-[168px] shrink-0 items-center justify-center rounded-card bg-sidebar">
          <PixelAvatar avatarId={current.id} mood={preview} size={120} />
        </div>
        <div>
          <p className="text-[24px] font-medium tracking-[-0.02em]">{current.name}</p>
          <p className="mt-1 text-[14px] text-muted">{current.personality}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <Chip key={m} active={preview === m} onClick={() => setPreview(m)}>
                {MOOD_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {AVATARS.map((a, i) => {
          const selected = a.id === app.avatarId
          return (
            <button
              key={a.id}
              onClick={() => app.setAvatarId(a.id)}
              className={cn(
                'relative flex flex-col items-center rounded-card border bg-card px-4 pt-6 pb-5 transition-colors hover:bg-hover',
                selected ? 'border-primary' : 'border-line'
              )}
            >
              {selected && (
                <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-on-primary">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <PixelAvatar avatarId={a.id} size={64} seed={i} />
              <p className="mt-3 text-[15px] font-semibold">{a.name}</p>
              <p className="text-[12px] text-muted">{a.personality}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
