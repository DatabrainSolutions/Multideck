import assert from 'node:assert/strict'
import test from 'node:test'
import { availableChargeChoices } from '../src/lib/charge-catalogue.ts'

test('charge choices follow quote or booking direction and mode', () => {
  const catalogue = {
    codes: [
      { RATECharge_ID: 'a', RATECharge_Code: 'AIR', RATECharge_Name: 'Air freight', RATECharge_Description: null, RATECharge_ScopeConfigured: true },
      { RATECharge_ID: 'b', RATECharge_Code: 'SEA', RATECharge_Name: 'Sea freight', RATECharge_Description: 'Ocean freight', RATECharge_ScopeConfigured: true },
      { RATECharge_ID: 'c', RATECharge_Code: 'LEGACY', RATECharge_Name: 'Legacy', RATECharge_Description: null, RATECharge_ScopeConfigured: false },
    ],
    scopes: [
      { charge_id: 'a', record_kind: 'quote', direction: 'cross_trade', mode: 'air' },
      { charge_id: 'b', record_kind: 'booking', direction: 'export', mode: 'sea' },
    ],
  }
  assert.deepEqual(availableChargeChoices(catalogue, 'quote', 'Cross trade', 'Air freight').map(choice => choice.code), ['AIR', 'LEGACY'])
  assert.deepEqual(availableChargeChoices(catalogue, 'booking', 'Export', 'Ocean FCL').map(choice => choice.code), ['SEA', 'LEGACY'])
  assert.deepEqual(availableChargeChoices(catalogue, 'booking', 'Import', 'Road').map(choice => choice.code), ['LEGACY'])
})
