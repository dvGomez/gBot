/**
 * Gera as imagens de divulgação do README (docs/marketing/*.png) e a prévia para redes sociais
 * (docs/marketing/social.png).
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
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css(w, h)}</style></head><body>${body}</body></html>`

// ───────────────────────── Hero ─────────────────────────
function hero() {
  const W = 1600
  const H = 860
  const team = [
    { id: 'brasa', name: 'Brasa', role: 'Research', status: 'Reading 14 sources about your industry…', mood: 'thinking', state: 'warn' },
    { id: 'nuvem', name: 'Nuvem', role: 'Writing', status: 'Writing the morning summary', mood: 'talking', state: 'warn' },
    { id: 'eco', name: 'Eco', role: 'Browser', status: 'Checked 42 invoices: 3 overdue', mood: 'happy', state: 'ok' },
    { id: 'bit', name: 'Bit', role: 'Calendar', status: 'Asleep · wakes up at 7:00', mood: 'sleeping', state: 'muted' }
  ]
  const rows = team
    .map(
      (m) => `
    <div style="display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid #242424">
      ${avatar(m.id, 46, m.mood as AvatarMood)}
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:600">${m.name} <span class="muted" style="font-weight:400;font-size:14px">· ${m.role}</span></div>
        <div style="font-size:15px;margin-top:3px" class="${m.state === 'muted' ? 'muted' : m.state}">${m.status}</div>
      </div>
      <span class="dot bg-${m.state}"></span>
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
    <div class="eyebrow">${avatar('brasa', 22)} <span><b>gBot</b> · the Mac and Windows app that runs on your Claude subscription</span></div>
    <h1 style="font-size:92px;margin-top:40px">Build an AI team that works <span class="hl">while you sleep.</span></h1>
    <p style="font-size:24px;line-height:1.45;color:#c9cacc;margin:34px 0 0;max-width:680px">
      Bots with personality, workflows that run on their own, a real browser in their hands and a memory that learns from mistakes. No API keys, no extra bill: it runs on the subscription you already pay for.
    </p>
    <div style="display:flex;gap:10px;margin-top:40px;flex-wrap:wrap">
      <span class="chip"><span class="dot bg-warn"></span>Scheduled workflows</span>
      <span class="chip"><span class="dot" style="background:#5B8DEF"></span>Browses for you</span>
      <span class="chip"><span class="dot bg-ok"></span>Learns on its own</span>
      <span class="chip"><span class="dot" style="background:#9B7BF0"></span>Bots that call bots</span>
    </div>
  </div>

  <div style="position:absolute;right:96px;top:120px;width:560px">
    <div style="position:absolute;right:30px;top:-70px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))">${avatar('brasa', 190)}</div>
    <div class="card" style="padding:30px 32px 18px;margin-top:150px;box-shadow:0 40px 80px rgba(0,0,0,.55)">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div style="font-size:15px;color:#8e9196;font-weight:500">Your team right now</div>
        <div class="warn" style="font-size:14px;display:flex;align-items:center;gap:8px"><span class="dot bg-warn"></span>3 working</div>
      </div>
      ${rows}
      <div style="font-size:14px;padding-top:14px" class="muted">Next workflow: <span style="color:#f2f2f2">Morning summary</span> · tomorrow, 7:00</div>
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
      <div class="chip" style="background:#141414">Every day · 7:00</div>${link}
      <div class="chip" style="background:#141414">${avatar('nuvem', 20)} Researches the news</div>${link}
      <div class="chip" style="border-color:#e3a02b55;color:#e3a02b;background:#141414">Anything urgent?</div>
    </div>`
  const browser = `
    <div style="width:280px;border:1px solid #2f2f2f;border-radius:14px;background:#121212;overflow:hidden">
      <div style="display:flex;gap:6px;align-items:center;padding:10px 12px;border-bottom:1px solid #262626">
        <span class="dot" style="background:#e5554d"></span><span class="dot" style="background:#e3a02b"></span><span class="dot bg-ok"></span>
        <span style="margin-left:10px;font-size:12px;color:#8e9196;font-family:GeistMono">portal.company.com</span>
      </div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:8px">
        <div style="height:9px;width:70%;background:#2a2a2a;border-radius:5px"></div>
        <div style="height:9px;width:90%;background:#2a2a2a;border-radius:5px"></div>
        <div style="height:26px;width:110px;background:#5B8DEF;border-radius:8px;margin-top:4px;box-shadow:0 0 0 3px #5B8DEF44"></div>
      </div>
    </div>`
  const memory = `
    <div style="width:290px;border:1px solid #2f2f2f;border-radius:14px;background:#121212;padding:16px 18px">
      <div style="font-size:12px;color:#2fae6b;font-family:GeistMono;letter-spacing:.08em">+ LESSON LEARNED</div>
      <div style="font-size:16px;font-weight:600;margin-top:8px">Send report to finance</div>
      <div style="font-size:13px;color:#8e9196;margin-top:6px;line-height:1.45">1. Export as PDF, not XLSX<br>2. Month at the start of the subject</div>
    </div>`
  return page(
    W,
    H,
    `
  <div class="bg-glow" style="width:700px;height:400px;left:450px;top:-260px;background:${ORANGE};opacity:.14"></div>
  <div style="position:absolute;left:96px;right:96px;top:80px">
    <div class="tag">What's in the box</div>
    <h1 style="font-size:58px;margin-top:16px">Everything a team needs. <span class="muted">Minus the payroll.</span></h1>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:52px">
      ${card(ORANGE, 'Bots with a face', 'Name, avatar, instructions and model. A specialist for every job.', `<div style="display:flex;align-items:center;gap:6px">${avatars}</div>`)}
      ${card('#e3a02b', 'Workflows that handle it', 'Drag boxes, pick a schedule and let the AI choose the path.', miniFlow)}
      ${card('#5B8DEF', 'A real browser', 'Your Chrome or Edge, with your saved logins. The bot clicks, reads and fills in.', browser)}
      ${card('#2fae6b', 'Memory that learns', 'Got it wrong once? It writes down the lesson and nails it next time.', memory)}
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
    <div class="tag" style="color:${accent}">Problem ${n}</div>
    <h1 style="font-size:56px;margin-top:20px">${pain}</h1>
    <p style="font-size:21px;line-height:1.5;color:#8e9196;margin:26px 0 0">${painText}</p>
    <div style="margin-top:44px;padding:26px 28px;border-radius:20px;background:#171717;border:1px solid #2a2a2a;border-left:4px solid ${accent}">
      <div style="display:flex;align-items:center;gap:12px;font-size:16px;font-weight:600;color:${accent}">${avatar('brasa', 26, 'happy')} With gBot</div>
      <div style="font-size:20px;line-height:1.5;color:#e4e4e4;margin-top:12px">${fix}</div>
    </div>
  </div>
  <div style="position:absolute;right:72px;top:70px;width:900px;height:680px">${mock}</div>
`
  )
}

function problem1() {
  type Row = { at: string; id: string; name: string; role: string; task: string; note?: string; state: 'ok' | 'run' | 'next' | 'sleep'; pct?: number }
  const rows: Row[] = [
    { at: '6:30 AM', id: 'brasa', name: 'Brasa', role: 'Research', task: 'Scanned Reddit, X and Hacker News: 3 trends in your niche', state: 'ok' },
    { at: '8:00 AM', id: 'nuvem', name: 'Nuvem', role: 'Writing', task: 'Wrote 3 LinkedIn posts', note: 'used Brasa\'s research', state: 'ok' },
    { at: '10:00 AM', id: 'eco', name: 'Eco', role: 'Prospecting', task: 'Found 47 of 100 companies that match your ideal customer', state: 'run', pct: 47 },
    { at: '2:00 PM', id: 'rubi', name: 'Rubi', role: 'Review', task: 'Reviews the posts and picks the best ones', state: 'next' },
    { at: 'Fri 5 PM', id: 'bit', name: 'Bit', role: 'Newsletter', task: 'Puts together the week\'s newsletter with the best of it all', state: 'sleep' }
  ]
  const badge = (r: Row) =>
    r.state === 'ok'
      ? `<span class="chip ok" style="border-color:#2fae6b44"><span class="dot bg-ok"></span>Done</span>`
      : r.state === 'run'
        ? `<span class="chip warn" style="border-color:#e3a02b55"><span class="dot bg-warn"></span>Working</span>`
        : r.state === 'next'
          ? `<span class="chip">Scheduled</span>`
          : `<span class="chip muted">Asleep</span>`
  const mood = (r: Row): AvatarMood => (r.state === 'ok' ? 'happy' : r.state === 'run' ? 'thinking' : r.state === 'sleep' ? 'sleeping' : 'idle')
  const row = (r: Row) => `
    <div style="display:flex;align-items:center;gap:18px;padding:16px 0;border-bottom:1px solid #222;${r.state === 'sleep' ? 'opacity:.6' : ''}">
      <div style="width:88px;font-family:GeistMono;font-size:14px;color:${r.state === 'run' ? '#e3a02b' : '#8e9196'}">${r.at}</div>
      ${avatar(r.id, 44, mood(r))}
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:600">${r.name} <span class="muted" style="font-weight:400;font-size:14px">· ${r.role}</span></div>
        <div style="font-size:15px;color:#c9cacc;margin-top:3px;line-height:1.4">${r.task}</div>
        ${r.note ? `<div style="font-size:13px;margin-top:4px;color:#9B7BF0">↳ ${r.note}</div>` : ''}
        ${r.pct ? `<div style="height:5px;border-radius:3px;background:#262626;margin-top:9px;overflow:hidden"><div style="height:100%;width:${r.pct}%;background:#e3a02b"></div></div>` : ''}
      </div>
      ${badge(r)}
    </div>`
  const mock = `
  <div class="card" style="position:absolute;inset:0;padding:30px 34px;background:#121212;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:6px">
      <div>
        <div style="font-size:20px;font-weight:600">Team routine · today</div>
        <div class="muted" style="font-size:14px;margin-top:4px">5 bots, each on its own schedule</div>
      </div>
      <div class="ok" style="font-size:15px;display:flex;align-items:center;gap:8px"><span class="dot bg-ok"></span>2 deliveries waiting for you</div>
    </div>
    ${rows.map(row).join('')}
    <div style="display:flex;align-items:center;gap:12px;margin-top:20px;padding:14px 18px;border-radius:14px;border:1px dashed #333;font-size:15px;color:#c9cacc">
      ${avatar('brasa', 24, 'happy')} You only review what arrives finished. The team handles the rest.
    </div>
  </div>`
  return problem(
    '01',
    ORANGE,
    'You\'re doing a whole team\'s job by yourself.',
    'Research, write, prospect, review, send the newsletter. Every day the list is longer than the day.',
    'Build your team: every bot with a name, a face and <b>its own routine</b>. One researches before dawn, another writes from what was found, another prospects in the afternoon. You just approve.',
    mock
  )
}

function problem2() {
  const step = (text: string) =>
    `<div style="display:flex;align-items:center;gap:10px;font-size:15px;color:#c9cacc;padding:7px 0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2fae6b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${text}</div>`
  const row = (nf: string, who: string, val: string, late: string) =>
    `<tr><td style="padding:11px 0;font-family:GeistMono;color:#c9cacc">${nf}</td><td>${who}</td><td style="text-align:right">${val}</td><td style="text-align:right;color:#e5554d">${late}</td></tr>`
  const mock = `
  <div class="card" style="position:absolute;inset:0;overflow:hidden;padding:30px 34px;background:#121212">
    <div style="display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:1px solid #242424">
      ${avatar('eco', 34, 'happy')}<div><div style="font-size:17px;font-weight:600">Eco</div><div class="muted" style="font-size:13px">Bot · uses the browser</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:24px">
      <div style="max-width:560px;background:#242424;border-radius:18px 18px 4px 18px;padding:14px 18px;font-size:17px;line-height:1.45">
        Go to the supplier portal, check October's invoices and tell me which ones are overdue.
      </div>
    </div>
    <div style="margin-top:22px;padding:6px 18px;border:1px solid #242424;border-radius:16px;background:#161616">
      ${step('Opened <span style="font-family:GeistMono;color:#f2f2f2">supplier-portal.com</span> in your browser')}
      ${step('Reused the login you had already saved')}
      ${step('Read 42 invoices from October')}
      ${step('Compared the due dates with today\'s date')}
    </div>
    <div style="margin-top:22px;font-size:17px;line-height:1.5">I found <b class="hl">3 overdue invoices</b>, totaling $11,290:</div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:15px">
      <tr class="muted" style="font-size:13px"><td style="padding-bottom:6px">Invoice</td><td>Supplier</td><td style="text-align:right">Amount</td><td style="text-align:right">Late by</td></tr>
      ${row('INV 1042', 'Alpha Packaging', '$4,820', '3 days')}
      ${row('INV 1057', 'Nova Logistics', '$3,910', '6 days')}
      ${row('INV 1063', 'Beta Services', '$2,560', '1 day')}
    </table>
    <div style="position:absolute;left:34px;right:34px;bottom:28px;display:flex;align-items:center;gap:12px;padding:14px 16px 14px 20px;border:1px solid #2a2a2a;border-radius:16px;background:#171717">
      <span style="flex:1;font-size:16px;color:#c9cacc">Email all three asking for payment, cc finance</span>
      <span style="width:34px;height:34px;border-radius:50%;background:#f2f2f2;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#141414" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></span>
    </div>
  </div>`
  return problem(
    '02',
    '#5B8DEF',
    'Copy-pasting between systems became your job.',
    'Portal, spreadsheet, email, portal again. Repetitive work nobody sees and everybody expects.',
    'gBot opens <b>your own browser</b>, with your saved logins, and does the boring part: signs in, searches, checks and hands you just the answer.',
    mock
  )
}

function problem3() {
  const mock = `
  <div style="position:absolute;inset:0">
    <div class="card" style="position:absolute;left:0;top:0;width:520px;padding:28px 30px;background:#121212;box-shadow:0 30px 60px rgba(0,0,0,.5)">
      <div style="display:flex;align-items:center;gap:12px">
        ${avatar('nina', 34)}<div><div style="font-size:17px;font-weight:600">Nina's memory</div><div class="muted" style="font-size:13px">4 lessons · ~120 tokens in the prompt</div></div>
      </div>
      <div style="margin-top:22px;border:1px solid #2fae6b55;border-radius:16px;padding:18px 20px;background:#2fae6b0d">
        <div style="font-size:12px;color:#2fae6b;font-family:GeistMono;letter-spacing:.1em">NEW LESSON</div>
        <div style="font-size:19px;font-weight:600;margin-top:8px">Publish a blog post</div>
        <div class="muted" style="font-size:14px;margin-top:4px">When: uploading a new post</div>
        <div style="font-size:15px;line-height:1.6;color:#d6d6d6;margin-top:12px">1. Save as a draft first<br>2. Cover image at 1200×630<br>3. Publish only after @Rubi signs off</div>
        <div class="muted" style="font-size:13px;margin-top:12px">Why: last week's post went out without a cover.</div>
      </div>
      <div class="muted" style="font-size:13px;margin-top:14px">Learned 2 days ago · "Weekly post" workflow</div>
    </div>

    <div class="card" style="position:absolute;right:0;top:330px;width:470px;padding:24px 26px;background:#171717;box-shadow:0 30px 60px rgba(0,0,0,.55)">
      <div style="display:flex;justify-content:flex-end">
        <div style="background:#242424;border-radius:16px 16px 4px 16px;padding:12px 16px;font-size:16px">@Nina write Friday's post</div>
      </div>
      <div style="display:flex;gap:12px;margin-top:18px">
        ${avatar('nina', 30, 'talking')}
        <div style="flex:1">
          <div style="display:flex;flex-direction:column;gap:8px">
            <span class="chip" style="align-self:flex-start"><span class="dot bg-ok"></span>Used the lesson "Publish a blog post"</span>
            <span class="chip" style="align-self:flex-start">${avatar('rubi', 18, 'happy')} Asked Rubi: "reviewed, good to go"</span>
          </div>
          <div style="font-size:16px;line-height:1.5;margin-top:12px;color:#e4e4e4">Done: draft saved with a cover and reviewed by Rubi. <span class="ok">Got it right the first time.</span></div>
        </div>
      </div>
    </div>
  </div>`
  return problem(
    '03',
    '#2fae6b',
    'Your AI forgets everything and repeats the same mistake tomorrow.',
    'Every chat starts from zero. You explain again, correct again, lose your patience again.',
    'gBot\'s bots <b>write down what went wrong</b> and get it right the next time. When they need help, they call in another specialist bot.',
    mock
  )
}

// ───────────────────────── Prévia para redes sociais (1280×640) ─────────────────────────
function social() {
  return page(
    1280,
    640,
    `
  <div class="dots" style="opacity:.5;mask-image:radial-gradient(circle at 78% 50%, #000 0, transparent 65%)"></div>
  <div class="bg-glow" style="width:520px;height:520px;right:40px;top:60px;background:${ORANGE};opacity:.25"></div>
  <div style="position:absolute;left:80px;top:90px;width:700px">
    <div style="display:flex;align-items:center;gap:16px">${avatar('brasa', 44)}<span style="font-size:40px;font-weight:600;letter-spacing:-0.03em">gBot</span></div>
    <h1 style="font-size:74px;margin-top:40px">Build an AI team that works <span class="hl">while you sleep.</span></h1>
    <p style="font-size:23px;color:#a9abaf;margin-top:30px">Bots, workflows, a real browser and memory. On your Claude subscription.</p>
  </div>
  <div style="position:absolute;right:90px;top:120px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))">${avatar('brasa', 300)}</div>
  <div style="position:absolute;right:84px;bottom:56px;display:flex;gap:8px;align-items:flex-end">${['nuvem', 'eco', 'bit', 'nina', 'rubi'].map((id) => avatar(id, 48)).join('')}</div>
`
  )
}

// ───────────────────────── Fotografa ─────────────────────────
const PAGES: [string, () => string, number, number][] = [
  ['hero.png', hero, 1600, 860],
  ['features.png', features, 1600, 720],
  ['problem-1-team.png', problem1, 1600, 820],
  ['problem-2-browser.png', problem2, 1600, 820],
  ['problem-3-memory.png', problem3, 1600, 820]
]

const tmp = mkdtempSync(join(tmpdir(), 'gbot-marketing-'))
const jobs: { html: string; out: string; width: number; height: number; scale?: number }[] = []
const add = (dir: string, name: string, html: string, width: number, height: number, scale?: number) => {
  mkdirSync(dir, { recursive: true })
  const file = join(tmp, name.replace('.png', '.html'))
  writeFileSync(file, html)
  jobs.push({ html: file, out: join(dir, name), width, height, scale })
}
for (const [name, make, width, height] of PAGES) add(OUT, name, make(), width, height)
// O GitHub pede 1280×640 e menos de 1 MB.
add(OUT, 'social.png', social(), 1280, 640, 1)

const jobsFile = join(tmp, 'jobs.json')
writeFileSync(jobsFile, JSON.stringify(jobs))
const r = spawnSync(join(ROOT, 'node_modules/.bin/electron'), [join(import.meta.dirname, 'capture.cjs'), jobsFile], { stdio: 'inherit' })
process.exit(r.status ?? 1)
