import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mutateBookingCargo } from './booking-cargo-client-fixture.mjs'

const fields = ['pieces','packageQuantity','grossWeightKg','netWeightKg','volumeCbm','length','width','height','declaredValue']
test('Booking inputs retain exact decimal text, partial input and invalid text until canonical validation', () => {
  for (const field of fields) {
    for (const value of ['9999999999999999.99','999999999999.999999','99999999999999.9999','1,234.50','1,2','1.','-','NaN','','0']) {
      const other = { id: 'other', description: 'Other cargo', grossWeightKg: '22.22' }
      const evidence = { version: 1 }
      const original = { quoteSnapshot: evidence, cargo: [{ id: 'selected', description: 'Cargo', [field]: '12', cargoData: { dg: 'preserve' } }, other] }
      const result = mutateBookingCargo(original, 0, field, value)
      assert.equal(result.cargo[0][field], value, `${field}: ${value}`)
      assert.equal(result.cargo[0].cargoData[field], value)
      assert.equal(result.cargo[0].cargoData.dg, 'preserve')
      assert.equal(result.cargo[0].id, 'selected')
      assert.equal(result.cargo[1], other)
      assert.equal(result.quoteSnapshot, evidence)
      assert.equal(original.cargo[0][field], '12')
    }
  }
})
