import { t as tr, useLanguage } from '@/i18n'
import { ModelSelect } from '@/components/ModelSelect'
import { useState } from 'react'
import { ArrowLeft, Check, Dices, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import type { AvatarDef, Bot } from '@shared/types'
import { AvatarPickerModal } from '@/components/AvatarPickerModal'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card, Field, PageHeader, inputClass } from '@/components/ui'
import { randomName } from '@/avatars/parts'
import { freeAvatars } from '@/lib/applyPlan'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

const EXAMPLE = tr('Exemplo:\nVocê é calma e caprichosa. Fala de um jeito simples e direto.\n- Antes de enviar algo a clientes, peça minha confirmação.\n- Prefira respostas curtas, em tópicos.')

/** Criar ou editar um bot: avatar, nome, descrição, personalidade, especializações e modelo. */
export function BotEditorView() {
  useLanguage()
  const app = useApp()
  const editing = app.selectedBot
  // Bot novo ganha um avatar que ainda ninguém do time usa.
  const [avatar, setAvatar] = useState<AvatarDef>(() => editing?.avatar ?? freeAvatars(app.bots, 1)[0])
  const [generated, setGenerated] = useState<AvatarDef[]>(() => (editing?.avatar.id.startsWith('gen-') ? [editing.avatar] : []))
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [instructions, setInstructions] = useState(editing?.instructions ?? '')
  const [specializationIds, setSpecializationIds] = useState<string[]>(editing?.specializationIds ?? [])
  const [errors, setErrors] = useState<{ name?: string }>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [projectId, setProjectId] = useState(editing ? editing.projectId : app.botDraftProjectId)
  // Bot novo já vem com o último modelo escolhido.
  const [providerId, setProviderId] = useState(editing ? (editing.providerId ?? 'claude-code') : app.providerId)
  const [model, setModel] = useState(() => (editing ? editing.model : app.preferredModel()))
  const [pickingAvatar, setPickingAvatar] = useState(false)
  // Especializações que o bot pode usar: as soltas e as do projeto dele (as já escolhidas continuam na lista).
  const available = app.specializations.filter((sp) => !sp.projectId || sp.projectId === projectId || specializationIds.includes(sp.id))
  const toggle = (id: string) => setSpecializationIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = async () => {
    const next = { name: name.trim() ? undefined : tr('Dê um nome ao bot.') }
    setErrors(next)
    if (next.name) return

    const now = Date.now()
    const bot: Bot = {
      id: editing?.id ?? uid(),
      name: name.trim(),
      avatar,
      description: description.trim(),
      instructions: instructions.trim(),
      specializationIds: specializationIds.filter((id) => app.getSpecialization(id)),
      projectId,
      providerId,
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
        subtitle={tr('Um membro do time: tem avatar, personalidade e especializações, conversa com você e roda rotinas sozinho.')}
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
            </div>
            {errors.name && <p className="mt-1 px-2 text-[12px] text-danger">{errors.name}</p>}
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
            placeholder={tr('Descrição: do que este bot cuida (ex.: Cuida dos contratos e dos pagamentos da empresa)')}
            aria-label={tr('Descrição do bot')}
            className="selectable w-full rounded-tile border border-transparent bg-transparent px-2 py-1 text-[14px] text-fg-2 outline-none placeholder:text-muted hover:border-line focus:border-muted/60"
          />
          <p className="px-2 text-[12px] text-muted">{tr('Clique no avatar para trocar. A descrição ajuda outros bots a saber quando perguntar a este.')}</p>
        </div>
      </Card>

      <Card className="mt-4 space-y-6 p-6">
        <Field
          label={tr('Especializações')}
          hint={tr('O que o bot sabe fazer. As instruções de cada uma vão para ele em todas as conversas e rotinas.')}
        >
          {available.length ? (
            <div className="flex flex-wrap gap-2">
              {available.map((sp) => {
                const on = specializationIds.includes(sp.id)
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => toggle(sp.id)}
                    title={sp.description}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                      on ? 'border-fg/40 bg-hover text-fg' : 'border-line text-fg-2 hover:bg-hover'
                    }`}
                  >
                    {on ? <Check size={13} /> : <GraduationCap size={13} className="text-muted" />}
                    {sp.name}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => app.editSpecialization(undefined, projectId)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-fg"
              >
                <Plus size={13} />{tr(' Nova especialização')}</button>
            </div>
          ) : (
            <p className="text-[13px] text-muted">
              {tr('Você ainda não tem especializações. ')}
              <button type="button" onClick={() => app.editSpecialization(undefined, projectId)} className="text-fg underline-offset-2 hover:underline">
                {tr('Criar uma especialização')}
              </button>
            </p>
          )}
        </Field>

        <Field
          label={tr('Personalidade e orientações (opcional)')}
          hint={tr('Tom, prioridades e o que evitar. Vale em tudo o que o bot faz, junto com as especializações.')}
        >
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            placeholder={tr(EXAMPLE)}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={tr('Projeto')} hint={tr('Bots soltos podem ser chamados em qualquer conversa; os de um projeto, só nele. As rotinas usam a pasta do projeto.')}>
            <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || undefined)} className={inputClass}>
              <option value="">{tr('Nenhum (bot solto)')}</option>
              {app.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={tr('Modelo')} hint={tr('Usado nas conversas e rotinas. Dá para trocar em cada conversa ou etapa.')}>
            <ModelSelect providerId={providerId} value={model}
              onChange={(providerId, model) => {
                setProviderId(providerId)
                app.setProviderId(providerId)
                const value = model === 'default' ? undefined : model
                setModel(value)
                app.rememberModel(value, providerId)
              }} fullWidth />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-5">
          {editing ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[13px] text-fg-2">{tr('Excluir o bot com as rotinas e as conversas dele?')}<Button variant="ghost" onClick={() => setConfirmDelete(false)}>{tr('Não')}</Button>
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
