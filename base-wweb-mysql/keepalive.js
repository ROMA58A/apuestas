const KEEPALIVE_INTERVAL = 10 * 60 * 1000

const startKeepalive = ({
    url = process.env.RENDER_EXTERNAL_URL,
    interval = KEEPALIVE_INTERVAL,
    fetchImpl = fetch,
    logger = console,
} = {}) => {
    if (!url) return () => {}

    let running = false
    let controller = null
    const ping = async () => {
        if (running) return
        running = true
        controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)
        try {
            const healthUrl = new URL('/health', url)
            const response = await fetchImpl(healthUrl, { signal: controller.signal })
            if (!response.ok) {
                throw new Error(`Render respondió HTTP ${response.status}`)
            }
            logger.log('Keepalive: ping correcto')
        } catch (error) {
            logger.error('Keepalive: ping fallido:', error.message)
        } finally {
            clearTimeout(timeout)
            controller = null
            running = false
        }
    }

    const timer = setInterval(ping, interval)
    timer.unref?.()

    return () => {
        clearInterval(timer)
        controller?.abort()
    }
}

module.exports = { KEEPALIVE_INTERVAL, startKeepalive }
