import type { AvatarDef, AvatarMood } from '@shared/types'
import { getAvatar, renderAvatar } from '@/avatars/sprites'
import { useTick } from '@/lib/ticker'

interface Props {
  /** Avatar pronto, pelo id… */
  avatarId?: string
  /** …ou a definição completa (avatares gerados, salvos junto com o bot). */
  avatar?: AvatarDef
  mood?: AvatarMood
  size?: number
  /** Desencontra a animação quando vários avatares aparecem juntos. */
  seed?: number
  animated?: boolean
  className?: string
}

export function PixelAvatar({ avatarId, avatar: def, mood = 'idle', size = 48, seed = 0, animated = true, className }: Props) {
  const tick = useTick(animated)
  const avatar = def ?? getAvatar(avatarId ?? '')
  const pixels = renderAvatar(avatar, mood, tick, seed)

  return (
    <svg
      width={size}
      height={(size * 13) / 12}
      viewBox="0 0 12 13"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={avatar.name}
    >
      {pixels.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={p.color} />
      ))}
    </svg>
  )
}
