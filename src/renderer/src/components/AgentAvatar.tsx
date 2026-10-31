import { MessageSquareText } from 'lucide-react'
import type { AvatarDef, AvatarMood } from '@shared/types'
import { cn } from '@/lib/cn'
import { PixelAvatar } from './PixelAvatar'

/** Avatar do bot da conversa, ou um ícone genérico de conversa quando não há bot (conversa normal). */
export function AgentAvatar({
  avatar,
  mood = 'idle',
  size = 28,
  animated = true,
  className
}: {
  avatar?: AvatarDef
  mood?: AvatarMood
  size?: number
  animated?: boolean
  className?: string
}) {
  if (avatar) return <PixelAvatar avatar={avatar} mood={mood} size={size} animated={animated} className={className} />
  return (
    <MessageSquareText
      size={Math.round(size * 0.95)}
      strokeWidth={1.6}
      className={cn('shrink-0 text-fg-2', className)}
    />
  )
}
