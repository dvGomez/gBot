import { FolderClosed } from 'lucide-react'
import type { Project } from '@shared/types'
import { cn } from '@/lib/cn'

export const PROJECT_COLORS = ['#F08A4B', '#5B8DEF', '#3DBE8B', '#9B7BF0', '#F07DB1', '#F2C14E', '#4FD1D9', '#EB5E55']

/** Ícone de pasta na cor do projeto. */
export function ProjectIcon({ project, size = 16, className }: { project: Pick<Project, 'color'>; size?: number; className?: string }) {
  return <FolderClosed size={size} strokeWidth={1.8} color={project.color} className={cn('shrink-0', className)} />
}

/** Tile grande com o ícone do projeto (cabeçalhos e cartões). */
export function ProjectTile({ project, size = 56 }: { project: Pick<Project, 'color'>; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-tile"
      style={{ width: size, height: size, background: `${project.color}22` }}
    >
      <ProjectIcon project={project} size={Math.round(size * 0.45)} />
    </div>
  )
}
