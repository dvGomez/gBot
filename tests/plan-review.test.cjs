const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { createJiti } = require('jiti')

const mock = resolve(__dirname, 'helpers/plan-store.cjs')
const jiti = createJiti(__filename, {
  alias: { '../../store': mock, '../../flows/store': mock, '@shared': resolve(__dirname, '../src/shared') }
})
const { state } = require(mock)
const { reviewPlan, sanitizePlan } = jiti('../src/main/providers/claude-code/architect.ts')

const spec = { ref: 's1', name: 'WhatsApp', instructions: 'Leia o WhatsApp Web.' }
const plan = (routine, extra = {}) => ({
  title: 'Plano',
  specializations: [spec],
  bots: [{ ref: 'b1', name: 'Lia', specializations: ['s1'], routines: [routine] }],
  ...extra
})

test('a well-built routine passes the review', () => {
  state.bots = [{ id: 'x', name: 'Teste', specializationIds: [] }]
  const review = reviewPlan(
    plan(
      {
        name: 'Pedidos',
        schedule: { mode: 'interval', everyMinutes: 60 },
        steps: [
          { type: 'task', specialization: 's1', message: 'Busque pedidos novos e pergunte ao @Teste o prazo.' },
          { type: 'task', specialization: 's1', message: 'Escreva os e-mails para enviar a cada cliente.' },
          { type: 'decision', message: 'Tem pedido?', options: ['Sim', 'Não'] },
          { type: 'confirm', message: 'Revise.', options: ['Enviar', 'Não enviar'] },
          { type: 'task', specialization: 's1', message: 'Envie as respostas aprovadas.' }
        ]
      },
      { attention: ['Se desconectar, avisa.'] }
    )
  )
  assert.deepEqual(review, { errors: [], warnings: [] })
})

test('broken references and empty steps are errors', () => {
  const review = reviewPlan({
    title: 'Plano',
    specializations: [{ ref: 's1', name: 'Vazia', instructions: '' }],
    bots: [
      {
        ref: 'b1',
        name: 'Lia',
        specializations: ['s9'],
        routines: [{ name: 'R', steps: [{ type: 'task', message: '' }, { type: 'decision', message: 'x', options: ['Sim', 'sim'] }] }]
      }
    ],
    attention: ['ok']
  })
  assert.equal(review.errors.length, 4)
  assert.match(review.errors.join('\n'), /sem instruções/)
  assert.match(review.errors.join('\n'), /"s9"/)
  assert.match(review.errors.join('\n'), /sem mensagem/)
  assert.match(review.errors.join('\n'), /opções repetidas/)
})

test('unhandled cases are warnings the model must fix or justify', () => {
  state.bots = []
  const review = reviewPlan(
    plan({
      name: 'Respostas',
      schedule: { mode: 'interval', everyMinutes: 10 },
      steps: [
        { type: 'task', specialization: 's1', message: 'Leia os pedidos e pergunte ao @Fulano.' },
        { type: 'task', specialization: 's1', message: 'Envie a resposta ao cliente (e-mail joao@empresa.com).' }
      ]
    })
  )
  const text = review.warnings.join('\n')
  assert.equal(review.errors.length, 0)
  assert.match(text, /irreversível.*"Envie".*nenhuma etapa "confirm"/)
  assert.match(text, /@fulano/)
  assert.doesNotMatch(text, /@empresa/)
  assert.match(text, /não tem "decision"/)
  assert.match(text, /a cada 10 min/)
  assert.match(text, /"attention" está vazio/)
})

test('sanitized plans keep attention, tested and suggestions', () => {
  const p = sanitizePlan(
    plan(
      { name: 'R', steps: [{ type: 'task', specialization: 's1', message: 'x' }] },
      { tested: ['Abri o site.'], attention: ['Pode desconectar.'], suggestions: [{ title: 'Resumo semanal', detail: 'Sexta às 17h.' }] }
    )
  )
  assert.deepEqual(p.tested, ['Abri o site.'])
  assert.deepEqual(p.attention, ['Pode desconectar.'])
  assert.deepEqual(p.suggestions, [{ title: 'Resumo semanal', detail: 'Sexta às 17h.' }])
})
