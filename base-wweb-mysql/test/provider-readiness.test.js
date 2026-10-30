const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createProviderReadiness } = require('../provider-readiness')

test('enables scheduled sends only while the WhatsApp provider is connected', () => {
    const provider = new EventEmitter()
    provider.vendor = new EventEmitter()
    let readyEvents = 0
    let disconnectEvents = 0
    const isReady = createProviderReadiness(provider, {
        onReady: () => {
            readyEvents += 1
        },
        onDisconnect: () => {
            disconnectEvents += 1
        },
    })

    assert.equal(isReady(), false)
    provider.emit('ready')
    assert.equal(isReady(), true)
    provider.vendor.emit('disconnected')
    assert.equal(isReady(), false)
    provider.emit('ready')
    assert.equal(isReady(), true)
    assert.equal(readyEvents, 2)
    assert.equal(disconnectEvents, 1)
})
