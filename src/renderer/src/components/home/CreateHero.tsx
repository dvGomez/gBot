import { t as tr, localized, useLanguage } from '@/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ModelSelect } from '@/components/ModelSelect'
import { Button } from '@/components/ui'
import { useApp } from '@/state/app'

/** Ideias que passam flutuando abaixo do balão; clicar coloca o texto no campo. */
const EXAMPLES = localized([tr('Responder pedidos de orçamento que chegam no WhatsApp'), tr('Todo dia às 8h, resumir meus e-mails importantes com os próximos passos'), tr('Monitorar preços dos concorrentes e me avisar quando mudarem'), tr('Criar posts para o Instagram a partir das novidades da semana'), tr('Conferir as notas fiscais da pasta e lançar numa planilha'), tr('Cobrar fornecedores dos pedidos atrasados no sistema'), tr('Ler avaliações novas no Google e sugerir respostas'), tr('Montar o relatório de vendas toda segunda de manhã'), tr('Triar currículos recebidos por e-mail para uma vaga'), tr('Revisar contratos e apontar cláusulas de risco'), tr('Acompanhar notícias do meu setor e mandar um resumo diário'), tr('Organizar a agenda da semana e lembrar das reuniões')])

/** Faixa de exemplos passando (o conteúdo vai duplicado para a volta ser contínua). */
function ExampleRow({ items, onPick }: { items: string[]; onPick(text: string): void }) {
  useLanguage()
  return (
    <div className="gbot-marquee-row gbot-fade-x overflow-hidden">
      <div className="gbot-marquee flex w-max gap-2 py-0.5">
        {[...items, ...items].map((text, i) => (
          <button
            key={i}
            onClick={() => onPick(text)}
            tabIndex={i < items.length ? 0 : -1}
            aria-hidden={i >= items.length}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1 text-[12px] text-fg-2 transition-colors hover:border-muted/60 hover:bg-hover hover:text-fg"
          >
            <Sparkles size={11} className="text-muted" />
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Atalho compacto da página inicial: o usuário conta o que quer automatizar e começa uma conversa com o arquiteto do
 * gBot, que pergunta o que faltar, testa de verdade (com permissão) e propõe os bots, especializações, rotinas e
 * projeto para criar.
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
  const examples = useMemo(() => [...EXAMPLES].sort(() => Math.random() - 0.5), [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Vazio: uma linha só (o exemplo do placeholder não estica o campo)
    if (!text) {
      el.style.height = ''
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
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
    <section className="rounded-card border border-line bg-sidebar px-4 pt-3.5 pb-3">
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h2 className="flex items-center gap-2 text-[14px] font-medium">
          <Sparkles size={14} className="text-warning" />
          {tr('O que vamos automatizar hoje?')}
        </h2>
        <p className="hidden truncate text-[12px] text-muted md:block">
          {ready ? tr('Considera os bots, especializações, rotinas e projetos que você já tem.') : tr('Conectar conta')}
        </p>
      </div>
      <div className="mt-2.5 flex items-center gap-2 rounded-[18px] border border-line bg-card py-1.5 pr-1.5 pl-3">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              start()
            }
          }}
          placeholder={tr('Ex.: Quero que um bot veja meu WhatsApp de hora em hora, encontre pedidos de orçamento e já responda com o valor.')}
          className="selectable block min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-1.5 text-[14px] leading-relaxed whitespace-pre-wrap text-fg outline-none placeholder:truncate placeholder:text-muted"
        />
        {models.length > 0 && <ModelSelect providerId={app.providerId} value={model} onChange={(provider, value) => changeModel(value, provider)} />}
        <Button variant="primary" onClick={start} disabled={!text.trim() || !ready || app.busy}>
          <Sparkles size={15} />{tr('Começar')}</Button>
      </div>
      <div className="mt-2.5">
        <ExampleRow items={examples} onPick={pick} />
      </div>
    </section>
  )
}
