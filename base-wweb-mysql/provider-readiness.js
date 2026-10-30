const createProviderReadiness = (provider, { onReady = () => {}, onDisconnect = () => {} } = {}) => {
    let ready = false
    provider.on('ready', () => {
        ready = true
        onReady()
    })
    provider.vendor.on('disconnected', () => {
        ready = false
        onDisconnect()
    })
    return () => ready
}

module.exports = { createProviderReadiness }
