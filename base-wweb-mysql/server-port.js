const net = require('node:net')

const isPortAvailable = (port, host) =>
    new Promise((resolve, reject) => {
        const server = net.createServer()
        server.once('error', reject)
        server.listen(port, host, () => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve()
            })
        })
    })

const findAvailablePort = async (startPort, host, excludedPorts = []) => {
    for (let port = startPort; port <= 65535; port += 1) {
        if (excludedPorts.includes(port)) continue
        try {
            await isPortAvailable(port, host)
            return port
        } catch (error) {
            if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') {
                throw error
            }
        }
    }

    throw new Error(`No hay puertos disponibles a partir del ${startPort}`)
}

module.exports = { findAvailablePort }
