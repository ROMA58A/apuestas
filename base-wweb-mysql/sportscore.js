const SPORT_SCORE_BASE_URL = process.env.SPORTSCORE_API_BASE || 'https://sportscore.com'
const SPORT_SCORE_USER_AGENT =
    process.env.SPORTSCORE_UA || 'sportscore-mcp/0.3 (+https://sportscore.com/developers/)'
const SUPPORTED_SPORTS = Object.freeze(['football', 'basketball', 'cricket', 'tennis'])
const ATTRIBUTION = 'Powered by SportScore — https://sportscore.com/'

class SportScoreError extends Error {
    constructor(message) {
        super(message)
        this.name = 'SportScoreError'
    }
}

const fetchSportScoreMatches = async ({
    sport = 'football',
    limit = 10,
    fetchImpl = fetch,
    baseUrl = SPORT_SCORE_BASE_URL,
} = {}) => {
    if (!SUPPORTED_SPORTS.includes(sport)) {
        throw new SportScoreError('Deporte no válido para SportScore')
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new SportScoreError('limit debe ser un entero entre 1 y 50')
    }

    const url = new URL('/api/widget/matches/', baseUrl)
    url.searchParams.set('sport', sport)
    url.searchParams.set('limit', String(limit))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
        let response
        try {
            response = await fetchImpl(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': SPORT_SCORE_USER_AGENT,
                },
                signal: controller.signal,
            })
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new SportScoreError('Tiempo de espera agotado al consultar SportScore')
            }
            throw new SportScoreError(`No se pudo conectar con SportScore: ${error.message}`)
        }
        if (!response.ok) {
            throw new SportScoreError(`SportScore respondió HTTP ${response.status}`)
        }

        let payload
        try {
            payload = await response.json()
        } catch {
            throw new SportScoreError('SportScore no devolvió JSON válido')
        }
        if (!payload || !Array.isArray(payload.matches)) {
            throw new SportScoreError('La respuesta de SportScore no contiene partidos')
        }
        return payload
    } finally {
        clearTimeout(timeout)
    }
}

const formatSportScoreMatches = (payload) => {
    if (!payload || !Array.isArray(payload.matches)) {
        throw new SportScoreError('La respuesta de SportScore no contiene partidos')
    }
    if (payload.matches.length === 0) {
        return `SportScore no reporta partidos recientes en este momento.\n${ATTRIBUTION}`
    }

    const lines = payload.matches.slice(0, 10).map((match) => {
        const home = typeof match.home === 'string' ? match.home : 'Local'
        const away = typeof match.away === 'string' ? match.away : 'Visitante'
        const homeScore = match.home_score ?? '-'
        const awayScore = match.away_score ?? '-'
        const status = match.status_text || match.status || 'Estado no disponible'
        const competition =
            typeof match.competition === 'string' ? ` · ${match.competition}` : ''
        return `• ${home} ${homeScore}-${awayScore} ${away}\n  ${status}${competition}`
    })

    return `⚽ Marcadores de fútbol — SportScore\n${lines.join('\n')}\n${ATTRIBUTION}`
}

module.exports = {
    ATTRIBUTION,
    SUPPORTED_SPORTS,
    SportScoreError,
    fetchSportScoreMatches,
    formatSportScoreMatches,
}
