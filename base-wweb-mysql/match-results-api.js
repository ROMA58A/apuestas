const http = require('node:http')
const { timingSafeEqual } = require('node:crypto')
const { fetchSportScoreMatches, SportScoreError, SUPPORTED_SPORTS } = require('./sportscore')
const { normalizeWatchedMatch } = require('./match-watch')

const MAX_BODY_BYTES = 1_048_576
const MAX_MATCHES_PER_REQUEST = 100

class ApiError extends Error {
    constructor(status, message) {
        super(message)
        this.status = status
    }
}

const normalizeMatch = (match, index) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) {
        throw new ApiError(400, `El partido ${index + 1} debe ser un objeto`)
    }

    const homeTeam = typeof match.homeTeam === 'string' ? match.homeTeam.trim() : ''
    const awayTeam = typeof match.awayTeam === 'string' ? match.awayTeam.trim() : ''
    const homeScore = match.homeScore
    const awayScore = match.awayScore
    const playedAt = match.playedAt
    const competition = match.competition === undefined ? null : match.competition

    if (!homeTeam || !awayTeam) {
        throw new ApiError(400, `El partido ${index + 1} necesita homeTeam y awayTeam`)
    }
    if (homeTeam.length > 120 || awayTeam.length > 120) {
        throw new ApiError(400, `Los nombres de equipo del partido ${index + 1} no pueden superar 120 caracteres`)
    }
    if (
        !Number.isSafeInteger(homeScore) ||
        homeScore < 0 ||
        homeScore > 65535 ||
        !Number.isSafeInteger(awayScore) ||
        awayScore < 0 ||
        awayScore > 65535
    ) {
        throw new ApiError(400, `Los marcadores del partido ${index + 1} deben ser enteros entre 0 y 65535`)
    }
    if (typeof playedAt !== 'string' || !playedAt.trim()) {
        throw new ApiError(400, `El partido ${index + 1} necesita playedAt`)
    }
    if (
        competition !== null &&
        (typeof competition !== 'string' ||
            competition.trim() === '' ||
            competition.trim().length > 160)
    ) {
        throw new ApiError(400, `La competencia del partido ${index + 1} no es válida`)
    }

    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(playedAt)
    const dateTime =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
            playedAt
        )
    const datePart = playedAt.slice(0, 10)
    const date = new Date(dateOnly ? `${playedAt}T00:00:00.000Z` : playedAt)
    if (
        (!dateOnly && !dateTime) ||
        Number.isNaN(new Date(`${datePart}T00:00:00.000Z`).getTime()) ||
        new Date(`${datePart}T00:00:00.000Z`).toISOString().slice(0, 10) !== datePart ||
        Number.isNaN(date.getTime()) ||
        (dateOnly && date.toISOString().slice(0, 10) !== playedAt)
    ) {
        throw new ApiError(400, `La fecha playedAt del partido ${index + 1} no es válida`)
    }

    return {
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        competition: competition === null ? null : competition.trim(),
        playedAt: date.toISOString().slice(0, 19).replace('T', ' '),
    }
}

const readJsonBody = (request) =>
    new Promise((resolve, reject) => {
        let body = ''
        let oversized = false
        request.setEncoding('utf8')
        request.on('data', (chunk) => {
            if (oversized) return
            body += chunk
            if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
                oversized = true
                reject(new ApiError(413, 'El cuerpo de la solicitud supera 1 MB'))
            }
        })
        request.on('end', () => {
            if (oversized) return
            if (!body) {
                reject(new ApiError(400, 'Envía un cuerpo JSON'))
                return
            }
            try {
                resolve(JSON.parse(body))
            } catch {
                reject(new ApiError(400, 'El cuerpo no contiene JSON válido'))
            }
        })
        request.on('error', reject)
    })

const sendJson = (response, status, data) => {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(data))
}

const hasValidToken = (request, token) => {
    if (!token) return true
    const authorization = request.headers.authorization || ''
    const providedToken = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : ''
    const expected = Buffer.from(token)
    const provided = Buffer.from(providedToken)
    return expected.length === provided.length && timingSafeEqual(expected, provided)
}

const createMatchResultsServer = ({
    store,
    watchStore,
    token,
    loadLiveMatches = fetchSportScoreMatches,
}) =>
    http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost')
        if (url.pathname === '/health') {
            if (request.method !== 'GET') {
                response.setHeader('Allow', 'GET')
                sendJson(response, 405, { error: 'Método no permitido' })
                return
            }
            sendJson(response, 200, { status: 'ok' })
            return
        }
        const watchIdMatch = /^\/api\/matches\/watch\/([a-f\d]{24})$/i.exec(url.pathname)
        const isWatchRoute = url.pathname === '/api/matches/watch' || watchIdMatch
        if (
            !['/api/matches', '/api/matches/live'].includes(url.pathname) &&
            !isWatchRoute
        ) {
            sendJson(response, 404, { error: 'Ruta no encontrada' })
            return
        }

        if (!hasValidToken(request, token)) {
            sendJson(response, 401, { error: 'Token no válido' })
            return
        }

        try {
            if (isWatchRoute) {
                if (!watchStore) {
                    sendJson(response, 503, { error: 'El seguimiento de partidos no está disponible' })
                    return
                }
                if (url.pathname === '/api/matches/watch' && request.method === 'GET') {
                    sendJson(response, 200, { matches: await watchStore.list() })
                    return
                }
                if (url.pathname === '/api/matches/watch' && request.method === 'POST') {
                    const payload = await readJsonBody(request)
                    const input = Array.isArray(payload)
                        ? payload
                        : payload && typeof payload === 'object' && Array.isArray(payload.matches)
                            ? payload.matches
                            : [payload]
                    if (input.length === 0 || input.length > MAX_MATCHES_PER_REQUEST) {
                        throw new ApiError(400, 'Envía entre 1 y 100 partidos')
                    }
                    let matches
                    try {
                        matches = input.map(normalizeWatchedMatch)
                    } catch (error) {
                        throw new ApiError(400, error.message)
                    }
                    sendJson(response, 201, { matches: await watchStore.create(matches) })
                    return
                }
                if (watchIdMatch && request.method === 'DELETE') {
                    const removed = await watchStore.remove(watchIdMatch[1])
                    if (!removed) {
                        sendJson(response, 404, { error: 'Partido no encontrado en seguimiento' })
                        return
                    }
                    sendJson(response, 200, { removed: true })
                    return
                }

                response.setHeader('Allow', watchIdMatch ? 'DELETE' : 'GET, POST')
                sendJson(response, 405, { error: 'Método no permitido' })
                return
            }

            if (url.pathname === '/api/matches/live') {
                if (request.method !== 'GET') {
                    response.setHeader('Allow', 'GET')
                    sendJson(response, 405, { error: 'Método no permitido' })
                    return
                }
                const sport = url.searchParams.get('sport') || 'football'
                const limitValue = url.searchParams.get('limit') || '10'
                const limit = Number(limitValue)
                if (!SUPPORTED_SPORTS.includes(sport)) {
                    throw new ApiError(
                        400,
                        `sport debe ser uno de estos valores: ${SUPPORTED_SPORTS.join(', ')}`
                    )
                }
                if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
                    throw new ApiError(400, 'limit debe ser un entero entre 1 y 50')
                }
                try {
                    const data = await loadLiveMatches({ sport, limit })
                    sendJson(response, 200, {
                        ...data,
                        attribution: 'Powered by SportScore — https://sportscore.com/',
                    })
                } catch (error) {
                    if (error instanceof SportScoreError) {
                        sendJson(response, 502, { error: error.message })
                        return
                    }
                    throw error
                }
                return
            }

            if (request.method === 'GET') {
                const limitValue = url.searchParams.get('limit') || '50'
                const offsetValue = url.searchParams.get('offset') || '0'
                const limit = Number(limitValue)
                const offset = Number(offsetValue)
                if (
                    !Number.isInteger(limit) ||
                    limit < 1 ||
                    limit > 100 ||
                    !Number.isInteger(offset) ||
                    offset < 0
                ) {
                    throw new ApiError(400, 'limit debe ser 1-100 y offset un entero no negativo')
                }

                const matches = await store.list({
                    limit,
                    offset,
                    team: url.searchParams.get('team') || null,
                    competition: url.searchParams.get('competition') || null,
                })
                sendJson(response, 200, { matches })
                return
            }

            if (request.method === 'POST') {
                const payload = await readJsonBody(request)
                const input = Array.isArray(payload)
                    ? payload
                    : payload && typeof payload === 'object' && Array.isArray(payload.matches)
                        ? payload.matches
                        : [payload]
                if (input.length === 0 || input.length > MAX_MATCHES_PER_REQUEST) {
                    throw new ApiError(400, 'Envía entre 1 y 100 partidos')
                }

                const matches = input.map(normalizeMatch)
                const created = await store.create(matches)
                sendJson(response, 201, { matches: created })
                return
            }

            response.setHeader('Allow', 'GET, POST')
            sendJson(response, 405, { error: 'Método no permitido' })
        } catch (error) {
            if (error instanceof ApiError) {
                sendJson(response, error.status, { error: error.message })
                return
            }
            console.error('Error en la API de resultados:', error.message)
            sendJson(response, 500, { error: 'No se pudo procesar la solicitud' })
        }
    })

module.exports = {
    createMatchResultsServer,
}
