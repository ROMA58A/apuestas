require('dotenv').config()

const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const { findAvailablePort } = require('./server-port')
const { createProviderReadiness } = require('./provider-readiness')
const { createRuntimeControl } = require('./runtime-control')
const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot')
const QRPortalWeb = require('@bot-whatsapp/portal')
const WebWhatsappProvider = require('@bot-whatsapp/provider/web-whatsapp')
const { MongoClient } = require('mongodb')
const {
    createMatchResultsServer,
} = require('./match-results-api')
const { fetchSportScoreMatches, formatSportScoreMatches } = require('./sportscore')
const {
    checkWatchedMatches,
} = require('./match-watch')
const {
    createMongoHistoryAdapter,
    createMongoIndexes,
    createMongoMatchResultsStore,
    createMongoMatchWatchStore,
} = require('./mongo-storage')
const {
    getScheduledDate,
    getTimeParts,
} = require('./investment-monitor')

const CHECK_TIME = process.env.CHECK_TIME || '09:00'
const TIME_ZONE = process.env.TIME_ZONE || 'America/Mexico_City'
const STATE_FILE = process.env.CHECK_STATE_FILE || './.investment-check-state.json'
const RUNTIME_FILE = path.join(__dirname, '.bot-runtime.json')
const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'apuestas'
const MATCH_API_HOST = process.env.MATCH_API_HOST || '127.0.0.1'
const MATCH_API_PORT = Number(process.env.MATCH_API_PORT || 3001)
const PORTAL_PORT = Number(process.env.PORT || 3000)
const MATCH_WATCH_INTERVAL = 60_000

const validateConfiguration = () => {
    const required = [
        'WHATSAPP_DESTINATION',
        'MONGODB_URI',
    ]
    const missing = required.filter((name) => !process.env[name])
    if (missing.length) {
        throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`)
    }
    getWhatsAppDestination()

    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(CHECK_TIME)) {
        throw new Error('CHECK_TIME debe tener el formato HH:mm, por ejemplo 09:00')
    }
    if (!Number.isInteger(MATCH_API_PORT) || MATCH_API_PORT < 1 || MATCH_API_PORT > 65535) {
        throw new Error('MATCH_API_PORT debe ser un puerto entre 1 y 65535')
    }
    if (!Number.isInteger(PORTAL_PORT) || PORTAL_PORT < 1 || PORTAL_PORT > 65535) {
        throw new Error('PORT debe ser un puerto entre 1 y 65535')
    }
    if (
        !['127.0.0.1', 'localhost', '::1'].includes(MATCH_API_HOST) &&
        !process.env.MATCH_API_TOKEN
    ) {
        throw new Error('Configura MATCH_API_TOKEN antes de exponer la API fuera de este equipo')
    }

    new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE })
}

const makeReminderFlow = () =>
    addKeyword(['ganancias', 'revisar ganancias', 'estado inversiones']).addAction(
        async (_, { flowDynamic }) => {
            await flowDynamic(getProfitTimeMessage())
        }
    )

const getProfitTimeMessage = () =>
    `La hora programada para sacar ganancias es ${CHECK_TIME} (${TIME_ZONE}).`

const getWhatsAppDestination = () => {
    const destination = process.env.WHATSAPP_DESTINATION.replace(/^\+/, '')
    if (!/^\d{7,15}$/.test(destination)) {
        throw new Error('WHATSAPP_DESTINATION debe ser un número internacional de 7 a 15 dígitos')
    }
    return destination
}

const makeLiveScoresFlow = (loadMatches) =>
    addKeyword(['marcadores', 'marcadores en vivo', 'resultados en vivo']).addAction(
        async (_, { flowDynamic }) => {
            try {
                const matches = await loadMatches({ sport: 'football', limit: 10 })
                await flowDynamic(formatSportScoreMatches(matches))
            } catch (error) {
                console.error('Error al consultar marcadores de SportScore:', error.message)
                await flowDynamic('No pude consultar los marcadores de SportScore. Inténtalo más tarde.')
            }
        }
    )

const makeMatchWatchFlow = (watchStore) =>
    addKeyword(['partidos seguidos', 'mis partidos']).addAction(
        async (_, { flowDynamic }) => {
            try {
                const matches = await watchStore.list()
                if (!matches.length) {
                    await flowDynamic('Todavía no tienes partidos en seguimiento.')
                    return
                }
                const lines = matches.map(
                    ({ homeTeam, awayTeam, competition, prediction, confidence }) =>
                        `• ${homeTeam} vs ${awayTeam}${competition ? ` · ${competition}` : ''}` +
                        `${prediction ? `\n  Pronóstico: ${prediction}` : ''}` +
                        `${confidence !== null && confidence !== undefined ? ` · ${confidence}%` : ''}`
                )
                await flowDynamic(`Partidos en seguimiento:\n${lines.join('\n')}`)
            } catch (error) {
                console.error('Error al consultar los partidos seguidos:', error.message)
                await flowDynamic('No pude consultar los partidos en seguimiento.')
            }
        }
    )

const sendScheduledReminder = async (provider) => {
    await provider.sendMessage(
        getWhatsAppDestination(),
        `⏰ Es hora de sacar ganancias. ${getProfitTimeMessage()}`,
        { options: {} }
    )
}

const sendBotActiveMessage = async (provider) => {
    await provider.sendMessage(
        getWhatsAppDestination(),
        '✅ El bot está activo y funcionando. WhatsApp conectado correctamente.',
        { options: {} }
    )
}

const startMatchWatchScheduler = (provider, watchStore, isProviderReady = () => true) => {
    let running = false
    const check = async () => {
        if (running || !isProviderReady()) return
        running = true
        try {
            await checkWatchedMatches({
                store: watchStore,
                loadMatches: () => fetchSportScoreMatches({ sport: 'football', limit: 50 }),
                notify: (message) =>
                    provider.sendMessage(getWhatsAppDestination(), message, {
                        options: {},
                    }),
            })
        } catch (error) {
            console.error('Error al revisar los partidos seguidos:', error.message)
        } finally {
            running = false
        }
    }

    check()
    const timer = setInterval(check, MATCH_WATCH_INTERVAL)
    return () => clearInterval(timer)
}

const startScheduler = (provider, isProviderReady = () => true) => {
    let lastRunDate = null
    let running = false
    const stateReady = fs
        .readFile(STATE_FILE, 'utf8')
        .then((contents) => {
            const state = JSON.parse(contents)
            if (typeof state.lastRunDate === 'string') lastRunDate = state.lastRunDate
        })
        .catch((error) => {
            if (error.code !== 'ENOENT') {
                console.error('No se pudo leer el estado del programador:', error.message)
            }
        })

    const check = async () => {
        await stateReady
        if (running) return

        const now = new Date()
        const date = getScheduledDate(now, TIME_ZONE)
        const time = getTimeParts(now, TIME_ZONE)
        const currentTime = `${time.hour}:${time.minute}`
        if (lastRunDate === date || currentTime < CHECK_TIME) return
        if (!isProviderReady()) return

        running = true
        try {
            await sendScheduledReminder(provider)
            lastRunDate = date
            await fs.mkdir(path.dirname(path.resolve(STATE_FILE)), { recursive: true })
            await fs.writeFile(STATE_FILE, JSON.stringify({ lastRunDate }), 'utf8')
        } finally {
            running = false
        }
    }

    stateReady
        .then(() => check())
        .catch((error) => console.error('Error en revisión programada:', error.message))

    const timer = setInterval(() => {
        check().catch((error) => console.error('Error en revisión programada:', error.message))
    }, 60_000)
    return () => clearInterval(timer)
}

const main = async () => {
    validateConfiguration()

    const mongoClient = new MongoClient(MONGODB_URI)
    await mongoClient.connect()
    const database = mongoClient.db(MONGODB_DB_NAME)
    await createMongoIndexes(database)
    const adapterDB = createMongoHistoryAdapter(database.collection('history'))
    const matchWatchStore = createMongoMatchWatchStore(
        database.collection('match_watchlist')
    )
    const portalPort = await findAvailablePort(PORTAL_PORT, undefined, [MATCH_API_PORT])
    if (portalPort !== PORTAL_PORT) {
        console.warn(`El puerto ${PORTAL_PORT} esta ocupado; el portal QR usara ${portalPort}.`)
    }
    const matchApiPort = await findAvailablePort(MATCH_API_PORT, MATCH_API_HOST, [portalPort])
    if (matchApiPort !== MATCH_API_PORT) {
        console.warn(`El puerto ${MATCH_API_PORT} esta ocupado; la API usara ${matchApiPort}.`)
    }
    const adapterFlow = createFlow([
        makeReminderFlow(),
        makeLiveScoresFlow(fetchSportScoreMatches),
        makeMatchWatchFlow(matchWatchStore),
    ])
    const adapterProvider = createProvider(WebWhatsappProvider)
    const isProviderReady = createProviderReadiness(adapterProvider, {
        onReady: () => {
            console.log('WhatsApp está conectado; se habilitaron los recordatorios.')
            sendBotActiveMessage(adapterProvider).catch((error) =>
                console.error('No se pudo enviar la confirmación de actividad:', error.message)
            )
        },
        onDisconnect: () =>
            console.warn('WhatsApp se desconectó; los recordatorios esperan la reconexión.'),
    })

    await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })
    QRPortalWeb({ port: portalPort })
    const matchApi = createMatchResultsServer({
        store: createMongoMatchResultsStore(database.collection('match_results')),
        watchStore: matchWatchStore,
        token: process.env.MATCH_API_TOKEN,
    })
    await new Promise((resolve, reject) => {
        matchApi.once('error', reject)
        matchApi.listen(matchApiPort, MATCH_API_HOST, resolve)
    })
    const stopServer = await createRuntimeControl(async () => {
        console.log('Deteniendo el bot y cerrando WhatsApp de forma ordenada...')
        stopScheduler()
        stopMatchWatchScheduler()
        const closeResource = async (label, close) => {
            try {
                await close()
            } catch (error) {
                console.error(`${label}:`, error.message)
            }
        }
        await closeResource('No se pudo cerrar el navegador de WhatsApp limpiamente', () =>
            adapterProvider.vendor.destroy()
        )
        await closeResource(
            'No se pudo cerrar la API de resultados',
            () =>
                new Promise((resolve, reject) => {
                    matchApi.close((error) => (error ? reject(error) : resolve()))
                })
        )
        await closeResource('No se pudo cerrar la conexión MongoDB', () => mongoClient.close())
        await closeResource('No se pudo cerrar el control local', () => stopServer.close())
        try {
            const runtime = JSON.parse(await fs.readFile(RUNTIME_FILE, 'utf8'))
            if (runtime.pid === process.pid) await fs.unlink(RUNTIME_FILE)
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('No se pudo limpiar el estado de ejecución:', error.message)
            }
        }
        console.log('Bot detenido sin cerrar la sesión de WhatsApp.')
        process.exit(0)
    })
    await fs.writeFile(
        RUNTIME_FILE,
        JSON.stringify({
            pid: process.pid,
            projectRoot: __dirname,
            portalPort,
            matchApiPort,
            stopPort: stopServer.port,
            stopToken: stopServer.token,
        }),
        'utf8'
    )
    process.once('exit', () => {
        try {
            const runtime = JSON.parse(fsSync.readFileSync(RUNTIME_FILE, 'utf8'))
            if (runtime.pid === process.pid) fsSync.unlinkSync(RUNTIME_FILE)
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('No se pudo limpiar el estado de ejecución:', error.message)
            }
        }
    })
    console.log(`API de resultados disponible en http://${MATCH_API_HOST}:${matchApiPort}/api/matches`)
    const stopScheduler = startScheduler(adapterProvider, isProviderReady)
    const stopMatchWatchScheduler = startMatchWatchScheduler(
        adapterProvider,
        matchWatchStore,
        isProviderReady
    )
}

if (require.main === module) {
    main().catch((error) => {
        console.error('No se pudo iniciar el bot:', error.message)
        process.exitCode = 1
    })
}

module.exports = {
    getProfitTimeMessage,
    getWhatsAppDestination,
    makeLiveScoresFlow,
    sendBotActiveMessage,
    sendScheduledReminder,
    startScheduler,
}
