import { t as tr, localized, useLanguage } from '@/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { AVATARS } from '@/avatars/sprites'
import { ModelSelect } from '@/components/ModelSelect'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useApp } from '@/state/app'

/** Ideias que passam flutuando abaixo do balão; clicar coloca o texto no campo. */
const EXAMPLES = localized([tr('Responder pedidos de orçamento que chegam no WhatsApp'), tr('Todo dia às 8h, resumir meus e-mails importantes com os próximos passos'), tr('Monitorar preços dos concorrentes e me avisar quando mudarem'), tr('Criar posts para o Instagram a partir das novidades da semana'), tr('Conferir as notas fiscais da pasta e lançar numa planilha'), tr('Cobrar fornecedores dos pedidos atrasados no sistema'), tr('Ler avaliações novas no Google e sugerir respostas'), tr('Montar o relatório de vendas toda segunda de manhã'), tr('Triar currículos recebidos por e-mail para uma vaga'), tr('Revisar contratos e apontar cláusulas de risco'), tr('Acompanhar notícias do meu setor e mandar um resumo diário'), tr('Organizar a agenda da semana e lembrar das reuniões')])

/** Faixa de exemplos passando (o conteúdo vai duplicado para a volta ser contínua). */
function ExampleRow({ items, reverse, onPick }: { items: string[]; reverse?: boolean; onPick(text: string): void }) {
  useLanguage()
  return (
    <div className="gbot-marquee-row gbot-fade-x overflow-hidden">
      <div className={cn('flex w-max gap-2.5 py-1', reverse ? 'gbot-marquee-reverse' : 'gbot-marquee')}>
        {[...items, ...items].map((text, i) => (
          <button
            key={i}
            onClick={() => onPick(text)}
            tabIndex={i < items.length ? 0 : -1}
            aria-hidden={i >= items.length}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card/70 px-4 py-2 text-[13px] text-fg-2 transition-colors hover:border-muted/60 hover:bg-hover hover:text-fg"
          >
            <Sparkles size={12} className="text-muted" />
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Destaque da página inicial: o usuário conta o que quer automatizar e começa uma conversa com o arquiteto do gBot,
 * que pergunta o que faltar, testa de verdade (com permissão) e propõe os bots, fluxos e projeto para criar.
 */
export function CreateHero() {
  useLanguage()
  const app = useApp()
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  // Modelo do arquiteto: começa no último escolhido e a escolha daqui também passa a ser o padrão.
  const [model, setModel] = useState(() => app.preferredModel())
  const models = app.providers.find((p) => p.id === app.providerId)?.models ?? []
  const ready = app.providers.some((p) => p.id === app.providerId && p.status === 'ready')

  // Time do balão: quatro avatares prontos, sempre os mesmos durante a visita.
  const crew = useMemo(() => [...AVATARS].sort(() => Math.random() - 0.5).slice(0, 4), [])
  const rows = useMemo(() => {
    const shuffled = [...EXAMPLES].sort(() => Math.random() - 0.5)
    return [shuffled.slice(0, 6), shuffled.slice(6)]
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [text])

  const start = () => {
    if (!text.trim() || !ready || app.busy) return
    app.startArchitect(text.trim(), model)
    setText('')
  }

  const changeModel = (m: string, provider: string) => {
    app.setProviderId(provider)
    const value = m === 'default' ? undefined : m
    setModel(value)
    app.rememberModel(value, provider)
  }

  const pick = (example: string) => {
    setText(example)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(example.length, example.length)
    })
  }

  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-sidebar px-8 pt-10 pb-8">
      <div className="relative mx-auto max-w-[760px]">
        <div className="flex items-end justify-center gap-3">
          {crew.map((a, i) => (
            <div key={a.id} className="gbot-float" style={{ animationDelay: `${i * -0.7}s` }}>
              <PixelAvatar avatar={a} size={i === 1 || i === 2 ? 52 : 40} seed={i} />
            </div>
          ))}
        </div>

        <h2 className="mt-5 text-center text-[34px] leading-tight font-medium tracking-[-0.03em]">{tr('O que vamos automatizar hoje?')}</h2>
        <p className="mx-auto mt-2 max-w-[620px] text-center text-[15px] leading-relaxed text-muted">{tr('Conte a tarefa que toma o seu tempo. O gBot testa de verdade com você, sem achismo, e monta a equipe de bots e os fluxos para ela rodar sozinha, no seu computador, com a sua assinatura.')}</p>

        {/* Balão de fala: a ponta aponta para a equipe */}
        <div className="relative mt-7">
          <div
            aria-hidden
            className="absolute -top-[7px] left-1/2 size-3.5 -translate-x-1/2 rotate-45 border-t border-l border-line bg-card"
          />
          <div className="relative rounded-[26px] border border-line bg-card p-3 shadow-2xl shadow-black/30">
            <textarea
              ref={ref}
              value={text}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  start()
                }
              }}
              placeholder={tr('Ex.: Quero que um bot veja meu WhatsApp de hora em hora, encontre pedidos de orçamento e já responda com o valor.')}
              className="selectable block w-full resize-none bg-transparent px-3 py-2 text-[16px] leading-relaxed text-fg outline-none placeholder:text-muted"
            />
            <div className="flex items-center justify-between gap-3 px-2 pt-1">
              <div className="flex min-w-0 items-center gap-3">
                {models.length > 0 && <ModelSelect providers={app.providers} providerId={app.providerId} value={model} onChange={(provider, value) => changeModel(value, provider)} placement="up" />}
                <p className="truncate text-[12px] text-muted">
                  {ready ? tr('Considera os bots, fluxos e projetos que você já tem.') : tr('Conectar conta')}
                </p>
              </div>
              <Button variant="primary" onClick={start} disabled={!text.trim() || !ready || app.busy}>
                <Sparkles size={15} />{tr('Começar')}</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-7 space-y-1.5">
        <ExampleRow items={rows[0]} onPick={pick} />
        <ExampleRow items={rows[1]} reverse onPick={pick} />
      </div>
    </section>
  )
}
