import { useState } from 'react'
import { ArrowLeft, Dices, LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
import type { AvatarDef, Bot } from '@shared/types'
import { AvatarPicker } from '@/components/AvatarPicker'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card, Field, PageHeader, inputClass } from '@/components/ui'
import { AVATARS } from '@/avatars/sprites'
import { randomName } from '@/avatars/parts'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

const EXAMPLE = `Exemplo:
Você é um revisor de contratos de prestação de serviço.
- Leia o contrato que eu enviar e liste as cláusulas de risco.
- Para cada risco, explique em linguagem simples e sugira uma redação alternativa.
- Seja objetivo e use tópicos.`

/** Criar ou editar um bot: avatar, nome, descrição e instruções. */
export function BotEditorView() {
  const app = useApp()
  const editing = app.selectedBot
  const [avatar, setAvatar] = useState<AvatarDef>(() => editing?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)])
  const [generated, setGenerated] = useState<AvatarDef[]>(() => (editing?.avatar.id.startsWith('gen-') ? [editing.avatar] : []))
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [instructions, setInstructions] = useState(editing?.instructions ?? '')
  const [errors, setErrors] = useState<{ name?: string; instructions?: string }>({})
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const suggest = async () => {
    if (!instructions.trim()) {
      setErrors((e) => ({ ...e, instructions: 'Escreva as instruções primeiro: a sugestão é feita a partir delas.' }))
      return
    }
    setSuggesting(true)
    setSuggestError(undefined)
    try {
      const s = await window.gbot.bots.suggest(instructions)
      if (s.name) setName(s.name)
      if (s.description) setDescription(s.description)
      setErrors((e) => ({ ...e, name: undefined }))
    } catch {
      setSuggestError('Não consegui sugerir agora. Tente de novo ou escreva o nome.')
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async () => {
    const next = {
      name: name.trim() ? undefined : 'Dê um nome ao bot.',
      instructions: instructions.trim() ? undefined : 'Escreva o que o bot deve fazer.'
    }
    setErrors(next)
    if (next.name || next.instructions) return

    const now = Date.now()
    const bot: Bot = {
      id: editing?.id ?? uid(),
      name: name.trim(),
      avatar,
      description: description.trim(),
      instructions: instructions.trim(),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    }
    await app.saveBot(bot)
    app.openBot(bot.id)
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <button
        onClick={() => (editing ? app.openBot(editing.id) : app.setView('home'))}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> Voltar
      </button>
      <PageHeader
        eyebrow="Bots"
        title={editing ? `Editar ${editing.name}` : 'Novo bot'}
        subtitle="Um bot é um assistente especializado: dê um nome, um avatar e as instruções do que ele deve fazer."
      />

      <div className="mt-8 grid grid-cols-[280px_1fr] gap-4">
        <Card className="flex flex-col items-center self-start p-6">
          <div className="flex size-[168px] items-center justify-center rounded-card bg-sidebar">
            <PixelAvatar avatar={avatar} size={112} />
          </div>
          <p className="mt-4 max-w-full truncate text-[20px] font-medium tracking-[-0.02em]">{name.trim() || 'Sem nome'}</p>
          <p className="mt-1 line-clamp-3 text-center text-[13px] text-muted">
            {description.trim() || 'A descrição aparece aqui.'}
          </p>
        </Card>

        <Card className="space-y-6 p-6">
          <Field
            label="Instruções"
            hint="O que o bot deve fazer, como deve responder e o que evitar. Ele segue isso em todas as conversas."
            error={errors.instructions}
          >
            <textarea
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value)
                setErrors((x) => ({ ...x, instructions: undefined }))
              }}
              rows={8}
              placeholder={EXAMPLE}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>

          <Field
            label="Nome"
            error={errors.name ?? suggestError}
            action={
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setName(randomName())
                    setErrors((x) => ({ ...x, name: undefined }))
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-fg-2 hover:bg-hover"
                >
                  <Dices size={12} /> Sortear
                </button>
                <button
                  type="button"
                  onClick={suggest}
                  disabled={suggesting || !app.connected}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-fg-2 hover:bg-hover disabled:opacity-50"
                >
                  {suggesting ? <LoaderCircle size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {suggesting ? 'Pensando…' : 'Sugerir com IA'}
                </button>
              </span>
            }
          >
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setErrors((x) => ({ ...x, name: undefined }))
              }}
              maxLength={40}
              placeholder="Revisor"
              className={inputClass}
            />
          </Field>

          <Field label="Descrição" hint="Uma frase sobre o que o bot faz. Outros bots usam isso para saber a quem perguntar.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
              placeholder="Revisa contratos e aponta cláusulas de risco"
              className={inputClass}
            />
          </Field>

          <Field label="Avatar">
            <AvatarPicker
              value={avatar}
              onChange={setAvatar}
              generated={generated}
              onGenerate={(a) => setGenerated((g) => [a, ...g].slice(0, 6))}
            />
          </Field>

          <div className="flex items-center justify-between border-t border-line pt-5">
            {editing ? (
              confirmDelete ? (
                <span className="flex items-center gap-2 text-[13px] text-fg-2">
                  Excluir o bot e as conversas dele?
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Não
                  </Button>
                  <Button onClick={() => void app.removeBot(editing.id)} className="border-danger/40 text-danger">
                    Excluir
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
                  <Trash2 size={14} /> Excluir bot
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => (editing ? app.openBot(editing.id) : app.setView('home'))}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void submit()}>
                {editing ? 'Salvar alterações' : 'Criar bot'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
