const http = require('node:http')
const { randomBytes, timingSafeEqual } = require('node:crypto')

const createRuntimeControl = async (onStop) => {
    const token = randomBytes(32).toString('hex')
    let stopping = false
    const server = http.createServer((request, response) => {
        const authorization = request.headers.authorization || ''
        const provided = Buffer.from(
            authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
        )
        const expected = Buffer.from(token)
        const authorized =
            provided.length === expected.length && timingSafeEqual(provided, expected)

        if (request.method !== 'POST' || request.url !== '/stop') {
            response.writeHead(404).end()
            return
        }
        if (!authorized) {
            response.writeHead(401).end()
            return
        }

        response.writeHead(202, { Connection: 'close' }).end('Stopping')
        if (!stopping) {
            stopping = true
            setImmediate(() => {
                onStop().catch((error) =>
                    console.error('No se pudo detener el bot correctamente:', error.message)
                )
            })
        }
    })

    await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })

    return {
        port: server.address().port,
        token,
        close: () => new Promise((resolve) => server.close(resolve)),
    }
}

module.exports = { createRuntimeControl }
