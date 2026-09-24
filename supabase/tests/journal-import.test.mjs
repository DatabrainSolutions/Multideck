import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJournalCsv, journalLinesFromRows, importJournalFile } from '../../multideck.client/src/lib/journal-import.ts'
const accounts = ['0010','5000'].map((code,i) => ({ FINNom_ID: String(i), FINNom_Code: code, FINNom_Name: 'Nominal '+code, FINNom_IsActive: true, FINNom_AllowManualPosting: true, FINNom_IsControlAccount: false }))
const parse = text => journalLinesFromRows(parseJournalCsv(text), accounts)
test('CSV imports exact codes and amounts, blank zero sides, and derives descriptions', () => {
  const result = parse('\uFEFFAccount code,Description,Debit,Credit\r\n0010,"Ignored, text",12.1234,\r\n5000,Ignored,,12.1234\r\n')
  assert.deepEqual(result, [
    { accountId: '0', description: 'Nominal 0010', debit: '12.1234', credit: '0' },
    { accountId: '1', description: 'Nominal 5000', debit: '0', credit: '12.1234' },
  ])
})
test('CSV handles escaped quotes and multiline fields', () => {
  assert.deepEqual(parseJournalCsv('a,b\n"x""y","two\nlines"')[1].values, ['x"y','two\nlines'])
  assert.throws(() => parseJournalCsv('a,"unfinished'), /unclosed/)
})
test('imports reject invalid accounts, values, headers and limits without partial results', () => {
  for (const [row, message] of [
    ['missing,10,0',/unknown/], ['10,10,0',/unknown/],
    ['0010,-10,0',/non-negative/], ['0010,1.12345,0',/four decimal/],
    ['0010,=1+2,0',/non-negative/], ['0010,1,1',/not both/],
    ['0010,0,0',/not both/],
  ]) assert.throws(() => parse('Account code,Debit,Credit\n'+row+'\n5000,0,10'),message)
  assert.throws(() => parse('Account code,Debit,Debit,Credit\n0010,1,1,0\n5000,0,0,1'),/one Account/)
  assert.throws(() => parse('Account code,Debit,Credit\n'+Array(201).fill('0010,1,0').join('\n')),/200/)
  assert.throws(() => journalLinesFromRows(parseJournalCsv('Account,Debit,Credit\n0010,1,0\n5000,0,1'), accounts.map(a=>({...a,FINNom_IsControlAccount:true}))),/manual journals/)
})
test('unbalanced valid rows are imported as drafts for correction, not silently adjusted', () => {
  assert.equal(parse('Account,Debit,Credit\n0010,10,0\n5000,0,9')[1].credit,'9')
})
test('file validation rejects oversized and unsupported files', async () => {
  await assert.rejects(importJournalFile({ size: 6000000, name: 'x.csv' },accounts),/5 MB/)
  await assert.rejects(importJournalFile({ size: 1, name: 'x.xls' },accounts),/xlsx/)
})
