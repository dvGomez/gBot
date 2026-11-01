import { t as tr, useLanguage } from '@/i18n'
import { ModelSelect } from '@/components/ModelSelect'
import { useState } from 'react'
import { ArrowLeft, Dices, LoaderCircle, Pencil, Sparkles, Trash2 } from 'lucide-react'
import type { AvatarDef, Bot } from '@shared/types'
import { AvatarPickerModal } from '@/components/AvatarPickerModal'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card, Field, PageHeader, inputClass } from '@/components/ui'
import { AVATARS } from '@/avatars/sprites'
import { randomName } from '@/avatars/parts'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

const EXAMPLE = tr('Exemplo:\nVocê é um revisor de contratos de prestação de serviço.\n- Leia o contrato que eu enviar e liste as cláusulas de risco.\n- Para cada risco, explique em linguagem simples e sugira uma redação alternativa.\n- Seja objetivo e use tópicos.')

/** Criar ou editar um bot: avatar, nome, descrição e instruções. */
export function BotEditorView() {
  useLanguage()
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
  const [projectId, setProjectId] = useState(editing ? editing.projectId : app.botDraftProjectId)
  // Bot novo já vem com o último modelo escolhido.
  const [model, setModel] = useState(() => (editing ? editing.model : app.preferredModel('claude-code')))
  const [pickingAvatar, setPickingAvatar] = useState(false)

  const suggest = async () => {
    if (!instructions.trim()) {
      setErrors((e) => ({ ...e, instructions: tr('Escreva as instruções primeiro: a sugestão é feita a partir delas.') }))
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
      setSuggestError(tr('Não consegui sugerir agora. Tente de novo ou escreva o nome.'))
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async () => {
    const next = {
      name: name.trim() ? undefined : tr('Dê um nome ao bot.'),
      instructions: instructions.trim() ? undefined : tr('Escreva o que o bot deve fazer.')
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
      projectId,
      model,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    }
    await app.saveBot(bot)
    app.openBot(bot.id)
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-[60px] pt-6 pb-12">
      <button
        onClick={() => (editing ? app.openBot(editing.id) : app.setView('home'))}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft size={14} />{tr(' Voltar')}</button>
      <PageHeader
        eyebrow="Bots"
        title={editing ? tr('Editar {0}', editing.name) : tr('Novo bot')}
        subtitle={tr('Um assistente especializado: escolha o avatar e o nome, depois escreva as instruções.')}
      />

      {/* Identidade: avatar (clique para trocar), nome e descrição */}
      <Card className="mt-8 flex items-start gap-6 p-6">
        <button
          type="button"
          onClick={() => setPickingAvatar(true)}
          title={tr('Trocar avatar')}
          className="group relative flex size-[132px] shrink-0 items-center justify-center rounded-card bg-sidebar transition-colors hover:bg-hover"
        >
          <PixelAvatar avatar={avatar} size={88} />
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full border border-line bg-page px-2 py-1 text-[11px] font-medium text-fg-2 opacity-80 transition-opacity group-hover:opacity-100">
            <Pencil size={11} />{tr(' Trocar')}</span>
        </button>

        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <div>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setErrors((x) => ({ ...x, name: undefined }))
                }}
                maxLength={40}
                placeholder={tr('Nome do bot')}
                aria-label={tr('Nome do bot')}
                className="selectable min-w-0 flex-1 rounded-tile border border-transparent bg-transparent px-2 py-1 text-[26px] font-medium tracking-[-0.02em] text-fg outline-none placeholder:text-muted hover:border-line focus:border-muted/60"
              />
              <button
                type="button"
                onClick={() => {
                  setName(randomName())
                  setErrors((x) => ({ ...x, name: undefined }))
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-fg-2 hover:bg-hover"
              >
                <Dices size={13} />{tr(' Sortear')}</button>
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || !app.connected}
                title={tr('Sugere nome e descrição a partir das instruções')}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-fg-2 hover:bg-hover disabled:opacity-50"
              >
                {suggesting ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {suggesting ? tr('Pensando…') : tr('Sugerir com IA')}
              </button>
            </div>
            {(errors.name ?? suggestError) && (
              <p className="mt-1 px-2 text-[12px] text-danger">{errors.name ?? suggestError}</p>
            )}
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
            placeholder={tr('Descrição: o que este bot faz (ex.: Revisa contratos e aponta cláusulas de risco)')}
            aria-label={tr('Descrição do bot')}
            className="selectable w-full rounded-tile border border-transparent bg-transparent px-2 py-1 text-[14px] text-fg-2 outline-none placeholder:text-muted hover:border-line focus:border-muted/60"
          />
          <p className="px-2 text-[12px] text-muted">{tr('Clique no avatar para trocar. A descrição ajuda outros bots a saber quando perguntar a este.')}</p>
        </div>
      </Card>

      <Card className="mt-4 space-y-6 p-6">
        <Field
          label={tr('Instruções')}
          hint={tr('O que o bot deve fazer, como deve responder e o que evitar. Ele segue isso em todas as conversas.')}
          error={errors.instructions}
        >
          <textarea
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value)
              setErrors((x) => ({ ...x, instructions: undefined }))
            }}
            rows={8}
            placeholder={tr(EXAMPLE)}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={tr('Projeto')} hint={tr('Bots soltos podem ser chamados em qualquer conversa; os de um projeto, só nele.')}>
            <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || undefined)} className={inputClass}>
              <option value="">{tr('Nenhum (bot solto)')}</option>
              {app.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={tr('Modelo')} hint={tr('Dá para trocar em cada conversa.')}>
            <ModelSelect providers={app.providers.filter((p) => p.id === 'claude-code')} providerId="claude-code" value={model}
              onChange={(providerId, model) => {
                const value = model === 'default' ? undefined : model
                setModel(value)
                app.rememberModel(value, providerId)
              }} fullWidth />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-5">
          {editing ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[13px] text-fg-2">{tr('Excluir o bot e as conversas dele?')}<Button variant="ghost" onClick={() => setConfirmDelete(false)}>{tr('Não')}</Button>
                <Button onClick={() => void app.removeBot(editing.id)} className="border-danger/40 text-danger">{tr('Excluir')}</Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
                <Trash2 size={14} />{tr(' Excluir bot')}</Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => (editing ? app.openBot(editing.id) : app.setView('home'))}>{tr('Cancelar')}</Button>
            <Button variant="primary" onClick={() => void submit()}>
              {editing ? tr('Salvar alterações') : tr('Criar bot')}
            </Button>
          </div>
        </div>
      </Card>

      {pickingAvatar && (
        <AvatarPickerModal
          value={avatar}
          generated={generated}
          onGenerate={(a) => setGenerated((g) => [a, ...g].slice(0, 6))}
          onConfirm={(a) => {
            setAvatar(a)
            setPickingAvatar(false)
          }}
          onClose={() => setPickingAvatar(false)}
        />
      )}
    </div>
  )
}
