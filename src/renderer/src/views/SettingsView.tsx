import { Card, PageHeader } from '@/components/ui'

function Row({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-0">
      <div>
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[13px] text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function SettingsView() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <PageHeader eyebrow="Sistema" title="Configurações" />
      <Card className="mt-8 px-6 py-2">
        <Row title="Versão" subtitle="gBot e Electron">
          <span className="font-mono text-[13px] text-fg-2">
            v{window.gbot.versions.app} · electron {window.gbot.versions.electron}
          </span>
        </Row>
      </Card>
    </div>
  )
}
