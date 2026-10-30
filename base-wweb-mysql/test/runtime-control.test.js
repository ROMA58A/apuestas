const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createRuntimeControl } = require('../runtime-control')

test('only an authorized local request triggers graceful shutdown', async (t) => {
    let stopCount = 0
    const control = await createRuntimeControl(async () => {
        stopCount += 1
    })
    t.after(() => control.close())

    const baseUrl = `http://127.0.0.1:${control.port}`
    const unauthorized = await fetch(`${baseUrl}/stop`, { method: 'POST' })
    assert.equal(unauthorized.status, 401)
    assert.equal(stopCount, 0)

    const response = await fetch(`${baseUrl}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${control.token}` },
    })
    assert.equal(response.status, 202)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(stopCount, 1)
})
