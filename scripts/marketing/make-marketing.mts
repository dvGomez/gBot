/**
 * Gera as imagens de divulgação do README (docs/marketing/*.png).
 * Cada imagem é uma página HTML no visual do gBot (Geist, tokens do tema escuro, avatares em pixel art),
 * fotografada pelo Electron em 2x. Conteúdo fictício: nada vem dos seus dados.
 *
 * Uso: npm run marketing
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AvatarMood } from '../../src/shared/types'
import { getAvatar, renderAvatar } from '../../src/renderer/src/avatars/sprites'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = join(ROOT, 'docs/marketing')
const FONT = join(ROOT, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')
const MONO = join(ROOT, 'node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2')

const ORANGE = getAvatar('brasa').color

/** Avatar em SVG (pixels nítidos). */
function avatar(id: string, size: number, mood: AvatarMood = 'idle') {
  const px = renderAvatar(getAvatar(id), mood, 5)
  const rects = px.map((p) => `<rect x="${p.x}" y="${p.y}" width="1.02" height="1.02" fill="${p.color}"/>`).join('')
  return `<svg class="av" width="${size}" height="${size}" viewBox="0 -0.5 12 13" shape-rendering="crispEdges">${rects}</svg>`
}

const css = (w: number, h: number) => `
@font-face { font-family: Geist; src: url('file://${FONT}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: GeistMono; src: url('file://${MONO}') format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
body {
  background: #0e0e0e; color: #f2f2f2; font-family: Geist, sans-serif; -webkit-font-smoothing: antialiased;
  position: relative;
}
.bg-glow { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
.dots { position: absolute; inset: 0; background-image: radial-gradient(#2a2a2a 1.4px, transparent 1.4px); background-size: 24px 24px; }
.eyebrow { display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px 8px 10px; border: 1px solid #2a2a2a; border-radius: 999px; background: #161616; font-size: 15px; color: #c9cacc; }
.eyebrow b { color: #f2f2f2; font-weight: 500; }
.tag { font-family: GeistMono, monospace; font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: ${ORANGE}; }
h1 { margin: 0; font-weight: 600; letter-spacing: -0.045em; line-height: 0.98; }
.hl { color: ${ORANGE}; }
.muted { color: #8e9196; }
.card { background: #171717; border: 1px solid #2a2a2a; border-radius: 22px; }
.chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 13px; border-radius: 999px; border: 1px solid #2a2a2a; background: #1c1c1c; font-size: 14px; color: #c9cacc; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.ok { color: #2fae6b; } .warn { color: #e3a02b; }
.bg-ok { background: #2fae6b; } .bg-warn { background: #e3a02b; box-shadow: 0 0 12px #e3a02b; } .bg-muted { background: #55585c; }
.av { image-rendering: pixelated; flex: none; }
`

const page = (w: number, h: number, body: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css(w, h)}</style></head><body>${body}</body></html>`

// ───────────────────────── Hero ─────────────────────────
function hero() {
  const W = 1600
  const H = 860
  const team = [
    { id: 'brasa', name: 'Brasa', role: 'Pesquisa', status: 'Lendo 14 fontes sobre o seu setor…', mood: 'thinking', state: 'warn' },
    { id: 'nuvem', name: 'Nuvem', role: 'Textos', status: 'Escrevendo o resumo da manhã', mood: 'talking', state: 'warn' },
    { id: 'eco', name: 'Eco', role: 'Navegador', status: 'Conferiu 42 notas: 3 vencidas', mood: 'happy', state: 'ok' },
    { id: 'bit', name: 'Bit', role: 'Agenda', status: 'Dormindo · acorda às 07:00', mood: 'sleeping', state: 'muted' }
  ] as const
  const rows = team
    .map(
      (t) => `
    <div style="display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid #242424">
      ${avatar(t.id, 46, t.mood)}
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:600">${t.name} <span class="muted" style="font-weight:400;font-size:14px">· ${t.role}</span></div>
        <div style="font-size:15px;margin-top:3px" class="${t.state === 'muted' ? 'muted' : t.state}">${t.status}</div>
      </div>
      <span class="dot bg-${t.state}"></span>
    </div>`
    )
    .join('')
  return page(
    W,
    H,
    `
  <div class="dots" style="opacity:.55;mask-image:radial-gradient(circle at 75% 45%, #000 0, transparent 70%)"></div>
  <div class="bg-glow" style="width:620px;height:620px;right:120px;top:40px;background:${ORANGE};opacity:.22"></div>
  <div class="bg-glow" style="width:420px;height:420px;left:-120px;bottom:-160px;background:#5B8DEF;opacity:.12"></div>

  <div style="position:absolute;left:96px;top:96px;width:760px">
    <div class="eyebrow">${avatar('brasa', 22)} <span><b>gBot</b> · app para Mac e Windows que usa a sua assinatura do Claude</span></div>
    <h1 style="font-size:92px;margin-top:40px">Monte um time de IA que trabalha <span class="hl">enquanto você dorme.</span></h1>
    <p style="font-size:24px;line-height:1.45;color:#c9cacc;margin:34px 0 0;max-width:680px">
      Bots com personalidade, fluxos que rodam sozinhos, um navegador de verdade nas mãos deles e memória que aprende com os erros.
      Sem API, sem cobrança extra: roda na assinatura que você já paga.
    </p>
    <div style="display:flex;gap:10px;margin-top:40px;flex-wrap:wrap">
      <span class="chip"><span class="dot bg-warn"></span>Fluxos agendados</span>
      <span class="chip"><span class="dot" style="background:#5B8DEF"></span>Navega por você</span>
      <span class="chip"><span class="dot bg-ok"></span>Aprende sozinho</span>
      <span class="chip"><span class="dot" style="background:#9B7BF0"></span>Bots que chamam bots</span>
    </div>
  </div>

  <div style="position:absolute;right:96px;top:120px;width:560px">
    <div style="position:absolute;right:30px;top:-70px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))">${avatar('brasa', 190)}</div>
    <div class="card" style="padding:30px 32px 18px;margin-top:150px;box-shadow:0 40px 80px rgba(0,0,0,.55)">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div style="font-size:15px;color:#8e9196;font-weight:500">Seu time agora</div>
        <div class="warn" style="font-size:14px;display:flex;align-items:center;gap:8px"><span class="dot bg-warn"></span>3 trabalhando</div>
      </div>
      ${rows}
      <div style="font-size:14px;padding-top:14px" class="muted">Próximo fluxo: <span style="color:#f2f2f2">Resumo da manhã</span> · amanhã, 07:00</div>
    </div>
  </div>
`
  )
}

// ───────────────────────── Recursos ─────────────────────────
function features() {
  const W = 1600
  const H = 720
  const card = (accent: string, title: string, text: string, art: string) => `
    <div class="card" style="padding:34px;display:flex;flex-direction:column;gap:22px;position:relative;overflow:hidden">
      <div class="bg-glow" style="width:260px;height:260px;right:-80px;top:-80px;background:${accent};opacity:.18;filter:blur(60px)"></div>
      <div style="height:170px;display:flex;align-items:center;justify-content:center;position:relative">${art}</div>
      <div style="font-size:30px;font-weight:600;letter-spacing:-0.03em">${title}</div>
      <div style="font-size:18px;line-height:1.5;color:#a9abaf">${text}</div>
    </div>`
  const avatars = ['nina', 'tico', 'brasa', 'rei', 'gele']
    .map((id, i) => `<div style="transform:translateY(${[12, -6, -18, -6, 12][i]}px)">${avatar(id, i === 2 ? 76 : 48)}</div>`)
    .join('')
  const link = `<div style="width:2px;height:16px;background:#3a3a3a;margin:0 auto"></div>`
  const miniFlow = `
    <div style="display:flex;flex-direction:column;align-items:center">
      <div class="chip" style="background:#141414">Todo dia · 07:00</div>${link}
      <div class="chip" style="background:#141414">${avatar('nuvem', 20)} Pesquisa as notícias</div>${link}
      <div class="chip" style="border-color:#e3a02b55;color:#e3a02b;background:#141414">Tem algo urgente?</div>
    </div>`
  const browser = `
    <div style="width:280px;border:1px solid #2f2f2f;border-radius:14px;background:#121212;overflow:hidden">
      <div style="display:flex;gap:6px;align-items:center;padding:10px 12px;border-bottom:1px solid #262626">
        <span class="dot" style="background:#e5554d"></span><span class="dot" style="background:#e3a02b"></span><span class="dot bg-ok"></span>
        <span style="margin-left:10px;font-size:12px;color:#8e9196;font-family:GeistMono">portal.empresa.com</span>
      </div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:8px">
        <div style="height:9px;width:70%;background:#2a2a2a;border-radius:5px"></div>
        <div style="height:9px;width:90%;background:#2a2a2a;border-radius:5px"></div>
        <div style="height:26px;width:110px;background:#5B8DEF;border-radius:8px;margin-top:4px;box-shadow:0 0 0 3px #5B8DEF44"></div>
      </div>
    </div>`
  const memory = `
    <div style="width:290px;border:1px solid #2f2f2f;border-radius:14px;background:#121212;padding:16px 18px">
      <div style="font-size:12px;color:#2fae6b;font-family:GeistMono;letter-spacing:.08em">+ LIÇÃO APRENDIDA</div>
      <div style="font-size:16px;font-weight:600;margin-top:8px">Enviar relatório ao financeiro</div>
      <div style="font-size:13px;color:#8e9196;margin-top:6px;line-height:1.45">1. Exportar em PDF, não XLSX<br>2. Assunto com o mês no início</div>
    </div>`
  return page(
    W,
    H,
    `
  <div class="bg-glow" style="width:700px;height:400px;left:450px;top:-260px;background:${ORANGE};opacity:.14"></div>
  <div style="position:absolute;left:96px;right:96px;top:80px">
    <div class="tag">O que vem na caixa</div>
    <h1 style="font-size:58px;margin-top:16px">Tudo que um time precisa. <span class="muted">Menos o salário.</span></h1>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:52px">
      ${card(ORANGE, 'Bots com cara própria', 'Nome, avatar, instruções e modelo. Um especialista para cada tarefa.', `<div style="display:flex;align-items:center;gap:6px">${avatars}</div>`)}
      ${card('#e3a02b', 'Fluxos que se viram', 'Arraste caixinhas, agende o horário e deixe a IA decidir o caminho.', miniFlow)}
      ${card('#5B8DEF', 'Navegador de verdade', 'Seu Chrome ou Edge, com os seus logins salvos. O bot clica, lê e preenche.', browser)}
      ${card('#2fae6b', 'Memória que aprende', 'Errou uma vez? Ele anota a lição e acerta de primeira na próxima.', memory)}
    </div>
  </div>
`
  )
}

// ───────────────────────── Problemas ─────────────────────────
function problem(n: string, accent: string, pain: string, painText: string, fix: string, mock: string) {
  const W = 1600
  const H = 820
  return page(
    W,
    H,
    `
  <div class="bg-glow" style="width:640px;height:640px;right:160px;top:120px;background:${accent};opacity:.16"></div>
  <div style="position:absolute;left:96px;top:96px;width:500px">
    <div class="tag" style="color:${accent}">Problema ${n}</div>
    <h1 style="font-size:56px;margin-top:20px">${pain}</h1>
    <p style="font-size:21px;line-height:1.5;color:#8e9196;margin:26px 0 0">${painText}</p>
    <div style="margin-top:44px;padding:26px 28px;border-radius:20px;background:#171717;border:1px solid #2a2a2a;border-left:4px solid ${accent}">
      <div style="display:flex;align-items:center;gap:12px;font-size:16px;font-weight:600;color:${accent}">${avatar('brasa', 26, 'happy')} Com o gBot</div>
      <div style="font-size:20px;line-height:1.5;color:#e4e4e4;margin-top:12px">${fix}</div>
    </div>
  </div>
  <div style="position:absolute;right:72px;top:70px;width:900px;height:680px">${mock}</div>${EDGES_SCRIPT}
`
  )
}

/** Caixinha do canvas de fluxo. */
function node(
  id: string,
  x: number,
  y: number,
  o: { icon: string; title: string; sub: string; body?: string; state?: 'ok' | 'warn' | 'skip'; extra?: string; w?: number }
) {
  const border = o.state === 'warn' ? '#e3a02b' : o.state === 'ok' ? '#2fae6b88' : '#333'
  const glow = o.state === 'warn' ? 'box-shadow:0 0 0 4px #e3a02b22, 0 20px 40px rgba(0,0,0,.5);' : 'box-shadow:0 20px 40px rgba(0,0,0,.45);'
  return `
  <div data-node="${id}" style="position:absolute;left:${x}px;top:${y}px;width:${o.w ?? 200}px;padding:14px 16px;border-radius:16px;background:#161616;border:2px solid ${border};${glow}${o.state === 'skip' ? 'opacity:.38;' : ''}">
    <div style="display:flex;gap:10px;align-items:center">
      <div style="width:34px;height:34px;border-radius:10px;background:#242424;display:flex;align-items:center;justify-content:center;flex:none">${o.icon}</div>
      <div style="min-width:0"><div style="font-size:15px;font-weight:600">${o.title}</div><div style="font-size:12px;color:#8e9196">${o.sub}</div></div>
    </div>
    ${o.body ? `<div style="font-size:13px;color:#c9cacc;margin-top:10px;line-height:1.4">${o.body}</div>` : ''}
    ${o.extra ?? ''}
  </div>`
}

/**
 * Desenha as ligações depois do layout: cada \`data-edge="de>para|cor|tracejado"\` liga a bolinha \`data-h\` (ou a
 * borda direita da caixinha \`data-node\`) à borda esquerda da caixinha de destino.
 */
const EDGES_SCRIPT = `<script>
document.fonts.ready.then(() => {
  for (const svg of document.querySelectorAll('svg[data-edges]')) {
    const box = svg.getBoundingClientRect()
    const at = (el, side) => { const r = el.getBoundingClientRect(); return [ (side === 'r' ? r.right : r.left) - box.left, r.top + r.height / 2 - box.top ] }
    for (const spec of svg.dataset.edges.split(';')) {
      const [route, color, dash] = spec.split('|')
      const [from, to] = route.split('>')
      const h = document.querySelector('[data-h="' + from + '"]')
      const [x1, y1] = h ? at(h, 'l').map((v, i) => v + (i ? 0 : 6)) : at(document.querySelector('[data-node="' + from + '"]'), 'r')
      const [x2, y2] = at(document.querySelector('[data-node="' + to + '"]'), 'l')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const dx = Math.max(40, (x2 - x1) / 2)
      path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2)
      path.setAttribute('stroke', color)
      path.setAttribute('stroke-width', '2.5')
      path.setAttribute('fill', 'none')
      if (dash) path.setAttribute('stroke-dasharray', '6 6')
      svg.appendChild(path)
    }
  }
})
</script>`

const ICON = {
  clock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f2f2f2" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  split: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e3a02b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3M15 9l6-6"/></svg>`,
  spark: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f2f2f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/></svg>`
}

function problem1() {
  const opt = (id: string, label: string, chosen: boolean) =>
    `<div style="position:relative;margin-top:8px;padding:7px 10px;border-radius:9px;background:${chosen ? '#e3a02b1f' : '#1f1f1f'};border:1px solid ${chosen ? '#e3a02b66' : '#2a2a2a'};font-size:12.5px;color:${chosen ? '#e3a02b' : '#8e9196'}">${label}
      <span data-h="${id}" style="position:absolute;right:-25px;top:50%;margin-top:-6px;width:12px;height:12px;border-radius:50%;background:#e3a02b;border:2px solid #161616"></span></div>`
  const edges = ['t>n|#2fae6b', 'n>d|#2fae6b', 'yes>a|#e3a02b', 'no>b|#3a3a3a|1'].join(';')
  const mock = `
  <div class="card" style="position:absolute;inset:0;overflow:hidden;background:#121212">
    <div class="dots" style="opacity:.8"></div>
    <div style="position:absolute;left:24px;top:22px;display:flex;gap:10px;align-items:center">
      <span style="font-size:17px;font-weight:600">Radar da manhã</span>
      <span class="chip" style="padding:4px 11px;font-size:13px"><span class="dot bg-ok"></span>Ativo</span>
    </div>
    <svg data-edges="${edges}" style="position:absolute;inset:0;overflow:visible" width="900" height="680"></svg>
    ${node('t', 16, 296, { icon: ICON.clock, title: 'Gatilho', sub: 'Seg a sex, 07:00', state: 'ok', w: 168 })}
    ${node('n', 222, 276, { icon: avatar('nuvem', 26, 'happy'), title: 'Nuvem', sub: 'Bot · Sonnet', body: 'Pesquise as notícias do meu setor das últimas 24 h.', state: 'ok', w: 204 })}
    ${node('d', 466, 262, {
      icon: ICON.split,
      title: 'Tem algo urgente?',
      sub: 'Decisão · Haiku',
      state: 'ok',
      w: 200,
      extra: opt('yes', 'Sim, é urgente', true) + opt('no', 'Não, só o resumo', false)
    })}
    ${node('a', 708, 110, { icon: ICON.spark, title: 'Me avise agora', sub: 'Prompt · Haiku', body: 'Mande no WhatsApp o que aconteceu e o que fazer.', state: 'warn', w: 180 })}
    ${node('b', 708, 480, { icon: ICON.spark, title: 'Resumo do dia', sub: 'Prompt · Sonnet', state: 'skip', w: 180 })}
    <div style="position:absolute;left:466px;top:440px;font-size:13px" class="warn">Escolheu: Sim, é urgente</div>
    <div style="position:absolute;left:24px;bottom:22px;right:24px;display:flex;justify-content:space-between;align-items:center">
      <span class="chip"><span class="dot bg-warn"></span>Rodando · 07:00:41</span>
      <span class="muted" style="font-size:14px">Só o caminho escolhido roda</span>
    </div>
  </div>`
  return problem(
    '01',
    '#e3a02b',
    'Você perde a primeira hora do dia caçando notícia.',
    'Dez abas abertas, metade lida, o resto esquecido. Amanhã, tudo de novo.',
    'Um fluxo agendado pesquisa, filtra e <b>decide por você</b>. Às 7h o resumo já está pronto, e se algo for urgente, você recebe o alerta na hora.',
    mock
  )
}

function problem2() {
  const step = (t: string) =>
    `<div style="display:flex;align-items:center;gap:10px;font-size:15px;color:#c9cacc;padding:7px 0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2fae6b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${t}</div>`
  const row = (nf: string, who: string, val: string, late: string) =>
    `<tr><td style="padding:11px 0;font-family:GeistMono;color:#c9cacc">${nf}</td><td>${who}</td><td style="text-align:right">${val}</td><td style="text-align:right;color:#e5554d">${late}</td></tr>`
  const mock = `
  <div class="card" style="position:absolute;inset:0;overflow:hidden;padding:30px 34px;background:#121212">
    <div style="display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:1px solid #242424">
      ${avatar('eco', 34, 'happy')}<div><div style="font-size:17px;font-weight:600">Eco</div><div class="muted" style="font-size:13px">Bot · usa o navegador</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:24px">
      <div style="max-width:560px;background:#242424;border-radius:18px 18px 4px 18px;padding:14px 18px;font-size:17px;line-height:1.45">
        Entra no portal de fornecedores, confere as notas de outubro e me diz quais estão vencidas.
      </div>
    </div>
    <div style="margin-top:22px;padding:6px 18px;border:1px solid #242424;border-radius:16px;background:#161616">
      ${step('Abriu <span style="font-family:GeistMono;color:#f2f2f2">portal-fornecedores.com</span> no seu navegador')}
      ${step('Usou o login que já estava salvo')}
      ${step('Leu 42 notas fiscais de outubro')}
      ${step('Comparou os vencimentos com a data de hoje')}
    </div>
    <div style="margin-top:22px;font-size:17px;line-height:1.5">Encontrei <b class="hl">3 notas vencidas</b>, somando R$ 11.290:</div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:15px">
      <tr class="muted" style="font-size:13px"><td style="padding-bottom:6px">Nota</td><td>Fornecedor</td><td style="text-align:right">Valor</td><td style="text-align:right">Atraso</td></tr>
      ${row('NF 1042', 'Alfa Embalagens', 'R$ 4.820', '3 dias')}
      ${row('NF 1057', 'Nova Logística', 'R$ 3.910', '6 dias')}
      ${row('NF 1063', 'Beta Serviços', 'R$ 2.560', '1 dia')}
    </table>
    <div style="position:absolute;left:34px;right:34px;bottom:28px;display:flex;align-items:center;gap:12px;padding:14px 16px 14px 20px;border:1px solid #2a2a2a;border-radius:16px;background:#171717">
      <span style="flex:1;font-size:16px;color:#c9cacc">Manda um e-mail cobrando os três, com cópia pro financeiro</span>
      <span style="width:34px;height:34px;border-radius:50%;background:#f2f2f2;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141414" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></span>
    </div>
  </div>`
  return problem(
    '02',
    '#5B8DEF',
    'Copiar e colar entre sistemas virou o seu emprego.',
    'Portal, planilha, e-mail, portal de novo. Trabalho repetitivo que ninguém vê e todo mundo cobra.',
    'O gBot abre <b>o seu navegador</b>, com os seus logins salvos, e faz a parte chata: entra, procura, confere e te entrega só a resposta.',
    mock
  )
}

function problem3() {
  const mock = `
  <div style="position:absolute;inset:0">
    <div class="card" style="position:absolute;left:0;top:0;width:520px;padding:28px 30px;background:#121212;box-shadow:0 30px 60px rgba(0,0,0,.5)">
      <div style="display:flex;align-items:center;gap:12px">
        ${avatar('nina', 34)}<div><div style="font-size:17px;font-weight:600">Memória da Nina</div><div class="muted" style="font-size:13px">4 lições · ~120 tokens no prompt</div></div>
      </div>
      <div style="margin-top:22px;border:1px solid #2fae6b55;border-radius:16px;padding:18px 20px;background:#2fae6b0d">
        <div style="font-size:12px;color:#2fae6b;font-family:GeistMono;letter-spacing:.1em">NOVA LIÇÃO</div>
        <div style="font-size:19px;font-weight:600;margin-top:8px">Publicar post no blog</div>
        <div class="muted" style="font-size:14px;margin-top:4px">Quando: ao subir um post novo</div>
        <div style="font-size:15px;line-height:1.6;color:#d6d6d6;margin-top:12px">1. Salvar como rascunho primeiro<br>2. Capa em 1200×630<br>3. Publicar só depois do ok do @Rubi</div>
        <div class="muted" style="font-size:13px;margin-top:12px">Por quê: o post da semana passada saiu sem capa.</div>
      </div>
      <div class="muted" style="font-size:13px;margin-top:14px">Aprendido há 2 dias · fluxo "Post semanal"</div>
    </div>

    <div class="card" style="position:absolute;right:0;top:330px;width:470px;padding:24px 26px;background:#171717;box-shadow:0 30px 60px rgba(0,0,0,.55)">
      <div style="display:flex;justify-content:flex-end">
        <div style="background:#242424;border-radius:16px 16px 4px 16px;padding:12px 16px;font-size:16px">@Nina escreve o post de sexta</div>
      </div>
      <div style="display:flex;gap:12px;margin-top:18px">
        ${avatar('nina', 30, 'talking')}
        <div style="flex:1">
          <div style="display:flex;flex-direction:column;gap:8px">
            <span class="chip" style="align-self:flex-start"><span class="dot bg-ok"></span>Usou a lição "Publicar post no blog"</span>
            <span class="chip" style="align-self:flex-start">${avatar('rubi', 18, 'happy')} Consultou Rubi: "revisado, pode subir"</span>
          </div>
          <div style="font-size:16px;line-height:1.5;margin-top:12px;color:#e4e4e4">Pronto: rascunho salvo com capa e revisado pela Rubi. <span class="ok">Acertei de primeira.</span></div>
        </div>
      </div>
    </div>
  </div>`
  return problem(
    '03',
    '#2fae6b',
    'Sua IA esquece tudo e repete o mesmo erro amanhã.',
    'Toda conversa começa do zero. Você explica de novo, corrige de novo e perde a paciência de novo.',
    'Os bots do gBot <b>anotam o que deu errado</b> e acertam de primeira na próxima. Quando precisam, chamam outro bot especialista para ajudar.',
    mock
  )
}

// ───────────────────────── Fotografa ─────────────────────────
const pages = {
  'hero.png': [hero(), 1600, 860],
  'recursos.png': [features(), 1600, 720],
  'problema-1-noticias.png': [problem1(), 1600, 820],
  'problema-2-navegador.png': [problem2(), 1600, 820],
  'problema-3-memoria.png': [problem3(), 1600, 820]
} as const

const tmp = mkdtempSync(join(tmpdir(), 'gbot-marketing-'))
mkdirSync(OUT, { recursive: true })
const jobs = Object.entries(pages).map(([name, [html, width, height]]) => {
  const file = join(tmp, name.replace('.png', '.html'))
  writeFileSync(file, html)
  return { html: file, out: join(OUT, name), width, height }
})
const jobsFile = join(tmp, 'jobs.json')
writeFileSync(jobsFile, JSON.stringify(jobs))
const r = spawnSync(join(ROOT, 'node_modules/.bin/electron'), [join(import.meta.dirname, 'capture.cjs'), jobsFile], { stdio: 'inherit' })
process.exit(r.status ?? 1)
