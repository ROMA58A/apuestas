const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { once } = require('node:events')
const { findAvailablePort } = require('../server-port')

test('finds a free port when the configured port is already occupied', async (t) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => server.close())

    const occupiedPort = server.address().port
    const availablePort = await findAvailablePort(occupiedPort, '127.0.0.1')

    assert.notEqual(availablePort, occupiedPort)
})

test('skips an explicitly reserved port', async () => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const reservedPort = server.address().port
    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
    )

    const availablePort = await findAvailablePort(reservedPort, '127.0.0.1', [reservedPort])
    assert.notEqual(availablePort, reservedPort)
})
