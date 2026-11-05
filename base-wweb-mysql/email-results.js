const nodemailer = require('nodemailer')
const { formatSportScoreMatches } = require('./sportscore')

const EMAIL_INTERVAL = 60_000

const createEmailTransport = () => {
    const user = process.env.GMAIL_USER
    const password = process.env.GMAIL_APP_PASSWORD
    if (!user || !password) return null
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass: password },
    })
}

const startEmailResults = ({
    loadMatches,
    transport = createEmailTransport(),
    recipient = process.env.RESULTS_EMAIL,
    interval = EMAIL_INTERVAL,
    logger = console,
} = {}) => {
    if (!transport || !recipient) {
        logger.warn('Correo de resultados desactivado: configura GMAIL_USER, GMAIL_APP_PASSWORD y RESULTS_EMAIL.')
        return () => {}
    }

    let running = false
    const send = async () => {
        if (running) return
        running = true
        try {
            const payload = await loadMatches({ sport: 'football', limit: 10 })
            await transport.sendMail({
                from: process.env.GMAIL_USER,
                to: recipient,
                subject: 'Resultados de fútbol',
                text: formatSportScoreMatches(payload),
            })
            logger.log(`Resultados enviados por correo a ${recipient}`)
        } catch (error) {
            logger.error('No se pudieron enviar los resultados por correo:', error.message)
        } finally {
            running = false
        }
    }

    send()
    const timer = setInterval(send, interval)
    return () => clearInterval(timer)
}

module.exports = { EMAIL_INTERVAL, createEmailTransport, startEmailResults }
