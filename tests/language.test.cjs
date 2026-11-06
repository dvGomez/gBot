const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createJiti } = require('jiti')
const { resolveLanguage, translate } = createJiti(__filename)('../src/shared/i18n.ts')

test('language selection follows the OS and respects saved overrides', () => {
  assert.equal(resolveLanguage('system', 'pt-BR'), 'pt-BR')
  assert.equal(resolveLanguage(undefined, 'pt-PT'), 'pt-BR')
  assert.equal(resolveLanguage('system', 'en-GB'), 'en')
  assert.equal(resolveLanguage('system', 'de-DE'), 'en')
  assert.equal(resolveLanguage('pt-BR', 'en-US'), 'pt-BR')
  assert.equal(resolveLanguage('en', 'pt-BR'), 'en')
})

test('translated UI interpolates values once and preserves workflow tokens', () => {
  assert.equal(translate('Nova conversa', 'en'), 'New chat')
  assert.equal(translate('Nova conversa', 'pt-BR'), 'Nova conversa')
  assert.equal(translate(' Início', 'en'), ' Home')
  assert.equal(translate('Abriu {0}', 'en', 'example.com'), 'Opened example.com')
  assert.equal(translate('Abriu example.com', 'en'), 'Opened example.com')
  assert.equal(translate('Abriu {0}', 'en', '{0}'), 'Opened {0}')
  assert(translate('O resultado das caixinhas anteriores vai junto automaticamente. Use {{anterior}} para escolher onde ele entra.', 'en').includes('{{anterior}}'))
  assert.equal(translate('User-created text with no catalog key', 'en'), 'User-created text with no catalog key')
  // Rótulos de "Sempre permitir" montados no processo principal
  assert.equal(translate('Sempre permitir este comando', 'en'), 'Always allow this command')
  assert.equal(translate('Sempre permitir textutil', 'en'), 'Always allow textutil')
})
