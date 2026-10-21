import test from 'node:test'
import assert from 'node:assert/strict'
import { imprimirJanela } from '../.test-build/impressora.js'
import { normDoc } from '../.test-build/firestoreData.js'

test('impressão escapa observações e título, preservando layout', () => {
  let html = ''
  globalThis.window = {open: () => ({document: {write: (s) => {html=s}, close: () => {}}})}
  imprimirJanela('</title><img src=x onerror=alert(1)>', [
    {texto: '<img src=x onerror=alert(1)> & "teste"', alinhamento:'centro'},
    {texto:'Café com pão', negrito:true},
  ])
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;img'))
  assert.ok(html.includes('&amp; &quot;teste&quot;'))
  assert.ok(html.includes('Cafe com pao'))
  assert.ok(html.includes('text-align:center'))
  delete globalThis.window
})

test('snapshots normalizam datas antigas e atuais, incluindo valores aninhados', () => {
  const timestamp = {toDate: () => new Date('2026-10-20T12:00:00Z')}
  const doc = normDoc('p', {createdAt:timestamp, updatedAt:timestamp, itens:[{baixadoEm:timestamp}]})
  assert.equal(doc.criadoEm,'2026-10-20T12:00:00.000Z')
  assert.equal(doc.atualizadoEm,doc.criadoEm)
  assert.equal(doc.itens[0].baixadoEm,doc.criadoEm)
  assert.equal(doc.createdAt,undefined)
  assert.equal(doc.id,'p')
  assert.equal(normDoc('u',{criadoEm:timestamp}).criadoEm,doc.criadoEm)
})
