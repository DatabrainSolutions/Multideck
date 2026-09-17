import test from 'node:test'
import assert from 'node:assert/strict'
import { processingReleaseFilingIssues } from '../functions/_shared/customs-processing-filing.mts'

const complete = () => ({
  procedureCode: '4051', additionalProcedureCode: 'F44',
  additionalInformationStatements: [{ statementCode: 'GEN86', statementDescription: 'Article 86(3)' }],
  additionalDocuments: [{ category: '9', type: 'WKS', reference: 'QA-RECORDS-01 see attached worksheet', lpcoExemptionCode: 'AC' }],
})

test('4051 claim requires paired GEN86/F44 and an identified AC worksheet without changing the declaration', () => {
  const item = complete(), before = structuredClone(item)
  assert.deepEqual(processingReleaseFilingIssues(item), [])
  assert.deepEqual(item, before)
  item.additionalInformationStatements = []
  assert.match(processingReleaseFilingIssues(item)[0].message, /GEN86/)
  assert.deepEqual(processingReleaseFilingIssues(item, { code: 'GEN86', description: 'Article 86(3)' }), [])
  item.additionalProcedureCode = '000'
  assert.match(processingReleaseFilingIssues(item, { code: 'GEN86', description: 'Article 86(3)' })[0].message, /F44/)
  item.additionalProcedureCodes = [{ code: 'F44' }]
  assert.deepEqual(processingReleaseFilingIssues(item, { code: 'GEN86', description: 'Article 86(3)' }), [])
})

test('worksheet name alone, missing records, incorrect status and malformed statements do not satisfy the claim', () => {
  const item = complete()
  item.additionalDocuments = []
  assert.match(processingReleaseFilingIssues(item)[0].message, /9WKS/)
  item.additionalDocuments = [{ category: '9', type: 'WKS', name: 'Worksheet', reference: 'see attached worksheet', lpcoExemptionCode: 'XX' }]
  assert.equal(processingReleaseFilingIssues(item).length, 2)
  item.additionalInformationStatements[0].statementDescription = 'Article 85'
  assert.equal(processingReleaseFilingIssues(item).length, 3)
  item.additionalInformationStatements = [null, false, []]
  assert.equal(processingReleaseFilingIssues(item).length, 3)
})

test('primary document fields work and ordinary or other-procedure items keep their separate rules', () => {
  const item = complete()
  item.additionalDocuments = []
  Object.assign(item, { additionalDocumentCategory: '9', additionalDocumentType: 'WKS', additionalDocumentId: 'QA-02 see attached worksheet', lpcoExemptionCode: 'AC' })
  assert.deepEqual(processingReleaseFilingIssues(item), [])
  assert.deepEqual(processingReleaseFilingIssues({ procedureCode: '4051', additionalProcedureCode: '000' }), [])
  assert.deepEqual(processingReleaseFilingIssues({ procedureCode: '4000', additionalProcedureCode: 'F44' }), [])
})
