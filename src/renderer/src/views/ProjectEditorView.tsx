import { t as tr, useLanguage } from '@/i18n'
import { useState } from 'react'
import { ArrowLeft, Check, FolderOpen, Trash2, X } from 'lucide-react'
import type { Project } from '@shared/types'
import { PROJECT_COLORS, ProjectTile } from '@/components/ProjectBadge'
import { Button, Card, Field, PageHeader, inputClass } from '@/components/ui'
import { uid } from '@/lib/format'
import { MentionTextarea } from '@/components/MentionTextarea'
import { useApp } from '@/state/app'

/** Criar ou editar um projeto. Só o nome é obrigatório; pasta e instruções podem vir depois. */
export function ProjectEditorView() {
  useLanguage()
  const app = useApp()
  const editing = app.selectedProject
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [instructions, setInstructions] = useState(editing?.instructions ?? '')
  const [folder, setFolder] = useState(editing?.folder)
  const [color, setColor] = useState(editing?.color ?? PROJECT_COLORS[app.projects.length % PROJECT_COLORS.length])
  const [nameError, setNameError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const back = () => (editing ? app.openProject(editing.id) : app.setView('home'))

  const pickFolder = async () => {
    const chosen = await window.gbot.projects.pickFolder(folder)
    if (chosen) setFolder(chosen)
  }

  const submit = async () => {
    if (!name.trim()) {
      setNameError(tr('Dê um nome ao projeto.'))
      return
    }
    const now = Date.now()
    const project: Project = {
      id: editing?.id ?? uid(),
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      folder,
      color,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    }
    await app.saveProject(project)
    app.openProject(project.id)
  }

  return (
    <div className="mx-auto w-full max-w-[860px] px-[60px] pt-6 pb-12">
      <button onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} />{tr(' Voltar')}</button>
      <PageHeader
        eyebrow={tr('Projetos')}
        title={editing ? tr('Editar {0}', editing.name) : tr('Novo projeto')}
        subtitle={tr('Agrupe bots e conversas. Pasta de trabalho e instruções são opcionais e podem ser definidas depois.')}
      />

      <Card className="mt-8 space-y-6 p-6">
        <div className="flex items-start gap-4">
          <ProjectTile project={{ color }} size={64} />
          <div className="flex-1">
            <Field label={tr('Nome')} error={nameError}>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError(undefined)
                }}
                maxLength={60}
                placeholder="App MagmaFit"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <Field label={tr('Cor')}>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={tr('Cor {0}', c)}
                className="flex size-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105"
                style={{ background: c, borderColor: c === color ? 'var(--fg)' : 'transparent' }}
              >
                {c === color && <Check size={14} strokeWidth={3} color="#141414" />}
              </button>
            ))}
          </div>
        </Field>

        <Field label={tr('Descrição')} hint={tr('Opcional. Uma frase sobre o projeto.')}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
            placeholder={tr('Tudo sobre o app de treinos')}
            className={inputClass}
          />
        </Field>

        <Field
          label={tr('Pasta de trabalho')}
          hint={tr('Opcional. Onde o Claude lê e cria arquivos nas conversas deste projeto. Sem pasta, ele usa a pasta padrão do gBot.')}
        >
          {folder ? (
            <div className="flex items-center gap-2 rounded-tile border border-line bg-sidebar px-3.5 py-2.5">
              <FolderOpen size={15} className="shrink-0 text-muted" />
              <span className="selectable min-w-0 flex-1 truncate font-mono text-[12px] text-fg-2">{folder}</span>
              <Button type="button" onClick={pickFolder} className="h-8">{tr('Trocar')}</Button>
              <button
                type="button"
                onClick={() => setFolder(undefined)}
                title={tr('Remover pasta')}
                className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <Button type="button" onClick={pickFolder}>
              <FolderOpen size={14} />{tr(' Escolher pasta')}</Button>
          )}
        </Field>

        <Field label={tr('Instruções do projeto')} hint={tr('Opcional. Valem para todas as conversas e bots deste projeto, somadas às de cada bot.')}>
          <MentionTextarea
            value={instructions}
            onValueChange={setInstructions}
            bots={app.bots.filter((b) => !b.projectId || b.projectId === editing?.id)}
            rows={5}
            placeholder={tr('Ex.: Este projeto é sobre o app MagmaFit (React + Angular). Responda em português e cite os arquivos que usar.')}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </Field>

        <div className="flex items-center justify-between border-t border-line pt-5">
          {editing ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[13px] text-fg-2">{tr('Excluir o projeto? Bots e conversas dele continuam, fora de projetos.')}<Button variant="ghost" onClick={() => setConfirmDelete(false)}>{tr('Não')}</Button>
                <Button onClick={() => void app.removeProject(editing.id)} className="text-danger">{tr('Excluir')}</Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
                <Trash2 size={14} />{tr(' Excluir projeto')}</Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={back}>{tr('Cancelar')}</Button>
            <Button variant="primary" onClick={() => void submit()}>
              {editing ? tr('Salvar alterações') : tr('Criar projeto')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
