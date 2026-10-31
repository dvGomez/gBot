import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Composer } from '@/components/Composer'
import { StatusDot } from '@/components/ui'
import { getAvatar, MOOD_LABELS } from '@/avatars/sprites'
import { cn } from '@/lib/cn'
import { useApp } from '@/state/app'

function Message({ msg, live }: { msg: ChatMessage; live: boolean }) {
  const app = useApp()
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="selectable max-w-[75%] rounded-[18px] bg-tile px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <div className="pt-0.5">
        <PixelAvatar avatarId={app.avatarId} mood={live ? app.mood : 'idle'} size={28} animated={live} />
      </div>
      <div
        className={cn(
          'selectable min-w-0 flex-1 pt-1 text-[15px] leading-relaxed whitespace-pre-wrap',
          msg.error && 'text-danger'
        )}
      >
        {msg.text || <span className="text-muted">Pensando…</span>}
      </div>
    </div>
  )
}

export function ChatView() {
  const app = useApp()
  const conv = app.activeConversation
  const provider = app.providers.find((p) => p.id === app.providerId)
  const avatar = getAvatar(app.avatarId)
  const bottom = useRef<HTMLDivElement>(null)
  const lastText = conv?.messages.at(-1)?.text

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [conv?.messages.length, lastText])

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[860px] items-center gap-3 px-8 pb-4">
        <PixelAvatar avatarId={app.avatarId} mood={app.mood} size={40} />
        <div>
          <p className="text-[15px] font-semibold">{avatar.name}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            {provider && <StatusDot status={provider.status} />}
            {provider?.name} · {MOOD_LABELS[app.mood]}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border-t border-line">
        <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-8">
          {conv?.messages.map((m, i) => (
            <Message key={m.id} msg={m} live={app.busy && i === conv.messages.length - 1} />
          ))}
          <div ref={bottom} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[860px] px-8 pt-2 pb-6">
        <Composer autoFocus placeholder="Responder…" />
      </div>
    </div>
  )
}
