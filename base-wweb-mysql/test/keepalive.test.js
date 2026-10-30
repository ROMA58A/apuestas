const test = require('node:test')
const assert = require('node:assert/strict')
const { startKeepalive } = require('../keepalive')

test('pings the Render health endpoint and reports failed responses', async () => {
    const urls = []
    const errors = []
    const stop = startKeepalive({
        url: 'https://apuestas-bot.onrender.com',
        interval: 5,
        fetchImpl: async (url) => {
            urls.push(url.toString())
            return { ok: false, status: 503 }
        },
        logger: { log: () => {}, error: (...args) => errors.push(args) },
    })

    try {
        await new Promise((resolve) => setTimeout(resolve, 30))
    } finally {
        stop()
    }

    assert.ok(urls.length > 0)
    assert.ok(urls.every((url) => url === 'https://apuestas-bot.onrender.com/health'))
    assert.ok(errors.length > 0)
})

test('does not start a timer when no Render external URL is configured', () => {
    const stop = startKeepalive({ url: '', interval: 1 })
    assert.equal(typeof stop, 'function')
    stop()
})
