import { useLanguage } from '@/i18n'
import { useRef, type TextareaHTMLAttributes } from 'react'
import type { Bot } from '@shared/types'
import { botMentions, useMentions } from '@/lib/useMentions'

/**
 * Campo de texto com `@` para mencionar bots: ao digitar `@`, aparece a lista de bots para escolher. Usado onde se
 * escrevem instruções e tarefas (ex.: "pergunte ao @Lia sobre o pedido"); quem lê o texto consulta o bot mencionado.
 */
export function MentionTextarea({
  value,
  onValueChange,
  bots,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange(value: string): void
  /** Bots que dá para mencionar aqui. */
  bots: Bot[]
}) {
  useLanguage()
  const ref = useRef<HTMLTextAreaElement>(null)
  const mentions = useMentions({ text: value, setText: onValueChange, ref, sources: [botMentions(bots)] })
  return (
    <div className="relative">
      <textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          mentions.onChange(e)
        }}
        onSelect={mentions.onSelect}
        onKeyDown={(e) => {
          if (!mentions.onKeyDown(e)) props.onKeyDown?.(e)
        }}
        onBlur={(e) => props.onBlur?.(e)}
      />
      {mentions.menu && <div className="absolute top-full left-0 z-20 mt-1">{mentions.menu}</div>}
    </div>
  )
}
