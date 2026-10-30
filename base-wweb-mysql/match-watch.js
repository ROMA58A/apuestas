const { createHash } = require('node:crypto')

const ATTRIBUTION = 'Powered by SportScore — https://sportscore.com/'

const normalizeWatchedMatch = (match, index) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) {
        throw new Error(`El partido ${index + 1} debe ser un objeto`)
    }

    const homeTeam = typeof match.homeTeam === 'string' ? match.homeTeam.trim() : ''
    const awayTeam = typeof match.awayTeam === 'string' ? match.awayTeam.trim() : ''
    const competition =
        match.competition === undefined || match.competition === null ? '' : match.competition
    const prediction = match.prediction === undefined ? '' : match.prediction
    const confidence = match.confidence === undefined ? null : match.confidence
    const kickoffAt = match.kickoffAt === undefined ? null : match.kickoffAt

    if (!homeTeam || !awayTeam || homeTeam.length > 120 || awayTeam.length > 120) {
        throw new Error(`El partido ${index + 1} necesita equipos de 1 a 120 caracteres`)
    }
    if (
        typeof competition !== 'string' ||
        competition.trim().length > 160
    ) {
        throw new Error(`La competencia del partido ${index + 1} no es válida`)
    }
    if (typeof prediction !== 'string' || prediction.trim().length > 120) {
        throw new Error(`El pronóstico del partido ${index + 1} no es válido`)
    }
    if (
        confidence !== null &&
        (!Number.isFinite(Number(confidence)) || Number(confidence) < 0 || Number(confidence) > 100)
    ) {
        throw new Error(`El porcentaje del partido ${index + 1} debe estar entre 0 y 100`)
    }
    if (
        kickoffAt !== null &&
        !isValidKickoff(kickoffAt)
    ) {
        throw new Error(`La fecha y hora del partido ${index + 1} no son válidas`)
    }

    return {
        homeTeam,
        awayTeam,
        competition: competition.trim(),
        prediction: prediction.trim(),
        confidence: confidence === null ? null : Number(confidence),
        kickoffAt,
    }
}

const normalizeTeamName = (name) =>
    name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/\s+/g, ' ')
        .trim()

const isValidKickoff = (value) => {
    if (typeof value !== 'string') return false
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
    if (!parts) return false
    const [, year, month, day, hour, minute, second = '00'] = parts
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    return (
        date.getUTCFullYear() === Number(year) &&
        date.getUTCMonth() === Number(month) - 1 &&
        date.getUTCDate() === Number(day) &&
        Number(hour) <= 23 &&
        Number(minute) <= 59 &&
        Number(second) <= 59
    )
}

const getFixtureKey = (match) =>
    createHash('sha256')
        .update(
            [match.homeTeam, match.awayTeam, match.competition || '', match.kickoffAt || '']
                .map(normalizeTeamName)
                .join('\0')
        )
        .digest('hex')

const getWatchKey = (match) =>
    createHash('sha256')
        .update([getFixtureKey(match), match.prediction || ''].join('\0'))
        .digest('hex')

const parsePrediction = (prediction, watched) => {
    const normalized = normalizeTeamName(prediction || '')
    const totalGoals = /^(mas|menos) de (\d+(?:[.,]\d+)?) goles?$/.exec(normalized)
    if (totalGoals) {
        return {
            type: totalGoals[1] === 'mas' ? 'over' : 'under',
            line: Number(totalGoals[2].replace(',', '.')),
        }
    }
    if (/^(empate|igualada|draw)$/.test(normalized)) return { type: 'draw' }

    const teamSelection = /^(.*?)\s+gana$/.exec(normalized) || /^gana\s+(.*?)$/.exec(normalized)
    if (teamSelection) {
        const selectedTeam = teamSelection[1]
        if (selectedTeam === normalizeTeamName(watched.homeTeam)) {
            return { type: 'home-win', team: watched.homeTeam }
        }
        if (selectedTeam === normalizeTeamName(watched.awayTeam)) {
            return { type: 'away-win', team: watched.awayTeam }
        }
    }
    return null
}

const classifyMatchStatus = (match) => {
    const status = normalizeTeamName(
        [match.status_text, match.status].filter((value) => typeof value === 'string').join(' ')
    )
    if (/\b(half[\s-]?time|halftime|ht|descanso|medio tiempo|intervalo)\b/.test(status)) {
        return 'halftime'
    }
    if (/\b(ft|full[\s-]?time|finished|ended|completed|final|terminado|finalizado)\b/.test(status)) {
        return 'finished'
    }
    if (/\b(not started|scheduled|upcoming|fixture|pre[\s-]?match|por comenzar|programado)\b/.test(status)) {
        return 'pending'
    }
    if (/\b(live|in play|in-play|in progress|playing|1h|2h|1st half|2nd half|first half|second half|en juego|en vivo)\b/.test(status)) {
        return 'live'
    }
    return 'unknown'
}

const formatScore = (match, homeScore, awayScore) =>
    Number.isSafeInteger(homeScore) && Number.isSafeInteger(awayScore)
        ? `${match.home} ${homeScore}-${awayScore} ${match.away}`
        : `${match.home} vs ${match.away}`

const getBetProgress = (watched, match, status, homeScore, awayScore) => {
    if (!watched.prediction) return null
    const market = parsePrediction(watched.prediction, watched)
    if (!market) {
        return `• ${watched.prediction}: no se puede evaluar automáticamente; revisa este pronóstico.`
    }
    if (!Number.isSafeInteger(homeScore) || !Number.isSafeInteger(awayScore)) {
        return `• ${watched.prediction}: marcador no disponible; todavía no puedo evaluarlo.`
    }

    const final = status === 'finished'
    let won = false
    let currentStatus = ''
    if (market.type === 'over') {
        const goals = homeScore + awayScore
        won = goals > market.line
        const requiredGoals = Math.floor(market.line) + 1
        currentStatus = won
            ? 'pronóstico cumplido; falta el final para confirmar la apuesta'
            : `falta${requiredGoals - goals === 1 ? '' : 'n'} ${requiredGoals - goals} gol${requiredGoals - goals === 1 ? '' : 'es'}`
    } else if (market.type === 'under') {
        const goals = homeScore + awayScore
        won = goals <= market.line
        currentStatus = goals > market.line
            ? 'pronóstico fallado: ya se superó el límite de goles'
            : 'va cumpliéndose; falta que termine sin superar el límite'
    } else if (market.type === 'draw') {
        won = homeScore === awayScore
        currentStatus = won
            ? 'va en empate; falta que se mantenga hasta el final'
            : 'falta que se iguale el marcador'
    } else {
        const isHomeSelection = market.type === 'home-win'
        const selectedScore = isHomeSelection ? homeScore : awayScore
        const otherScore = isHomeSelection ? awayScore : homeScore
        won = selectedScore > otherScore
        currentStatus = won
            ? `va ganando ${market.team}; falta que termine arriba`
            : `falta que ${market.team} se ponga por delante y termine ganando`
    }

    if (final) {
        return `• ${watched.prediction}: ${won ? '✅ Apuesta ganada' : '❌ Apuesta perdida'}.`
    }
    return `• ${watched.prediction}: ${currentStatus}.`
}

const checkWatchedMatches = async ({ store, loadMatches, notify }) => {
    const watchlist = await store.list()
    if (!watchlist.length) return

    const payload = await loadMatches()
    if (!payload || !Array.isArray(payload.matches)) {
        throw new Error('La fuente de marcadores no devolvió una lista de partidos válida')
    }

    const fixtures = new Map()
    for (const watched of watchlist) {
        const fixtureKey = watched.fixtureKey || getFixtureKey(watched)
        if (!fixtures.has(fixtureKey)) fixtures.set(fixtureKey, [])
        fixtures.get(fixtureKey).push(watched)
    }

    for (const [fixtureKey, bets] of fixtures) {
        const watched = bets[0]
        const match = payload.matches.find((candidate) => {
            if (
                !candidate ||
                typeof candidate.home !== 'string' ||
                typeof candidate.away !== 'string' ||
                normalizeTeamName(candidate.home) !== normalizeTeamName(watched.homeTeam) ||
                normalizeTeamName(candidate.away) !== normalizeTeamName(watched.awayTeam)
            ) {
                return false
            }
            return (
                !watched.competition ||
                normalizeTeamName(candidate.competition || '') ===
                    normalizeTeamName(watched.competition)
            )
        })
        if (!match) continue

        const status = classifyMatchStatus(match)
        const homeScore =
            match.home_score === null || match.home_score === undefined
                ? null
                : Number(match.home_score)
        const awayScore =
            match.away_score === null || match.away_score === undefined
                ? null
                : Number(match.away_score)
        const validScore =
            Number.isSafeInteger(homeScore) &&
            homeScore >= 0 &&
            homeScore <= 65535 &&
            Number.isSafeInteger(awayScore) &&
            awayScore >= 0 &&
            awayScore <= 65535
        if (!validScore && status === 'unknown') continue

        const previous = bets[0]
        const previousStatus = previous.lastStatus || 'unknown'
        const previousHomeScore = previous.lastHomeScore
        const previousAwayScore = previous.lastAwayScore
        const safeHomeScore = validScore ? homeScore : null
        const safeAwayScore = validScore ? awayScore : null
        const eventLines = []
        let startedNotified = bets.some((bet) => bet.startedNotified)
        let halftimeNotified = bets.some((bet) => bet.halftimeNotified)
        let finishedNotified = bets.some((bet) => bet.finishedNotified)

        if (status === 'live' && !startedNotified) {
            eventLines.push(
                previousStatus === 'pending'
                    ? '🔔 ¡El partido acaba de iniciar!'
                    : '▶️ El partido ya está en juego; comienza el seguimiento.'
            )
            startedNotified = true
        }
        if (status === 'halftime' && !halftimeNotified) {
            eventLines.push('⏸️ Medio tiempo.')
            halftimeNotified = true
            startedNotified = true
        }

        const homeGoals =
            validScore && Number.isSafeInteger(previousHomeScore)
                ? homeScore - previousHomeScore
                : 0
        const awayGoals =
            validScore && Number.isSafeInteger(previousAwayScore)
                ? awayScore - previousAwayScore
                : 0
        if (homeGoals > 0 || awayGoals > 0) {
            const scorers = []
            if (homeGoals > 0) scorers.push(`${match.home} (${homeGoals})`)
            if (awayGoals > 0) scorers.push(`${match.away} (${awayGoals})`)
            eventLines.push(`⚽ Gol: ${scorers.join(' y ')}.`)
        }
        if (
            status === 'finished' &&
            !finishedNotified &&
            (validScore || previousStatus !== 'finished')
        ) {
            eventLines.push(
                validScore
                    ? '🏁 Partido terminado. Resultado final:'
                    : '🏁 Partido terminado, pero SportScore aún no informa el marcador final.'
            )
            finishedNotified = validScore
        }

        const progress = {
            lastHomeScore: validScore ? homeScore : previousHomeScore,
            lastAwayScore: validScore ? awayScore : previousAwayScore,
            lastStatus: status === 'unknown' ? previous.lastStatus : status,
            startedNotified,
            halftimeNotified,
            finishedNotified,
        }
        const scoreChanged =
            validScore &&
            (homeScore !== previousHomeScore || awayScore !== previousAwayScore)
        const statusChanged = status !== 'unknown' && status !== previousStatus
        const eventDetected = eventLines.length > 0

        if (eventDetected) {
            const message = [
                ...eventLines,
                formatScore(match, safeHomeScore, safeAwayScore),
                ...bets
                    .map((bet) =>
                        getBetProgress(
                            bet,
                            match,
                            status === 'finished' && !validScore ? 'unknown' : status,
                            safeHomeScore,
                            safeAwayScore
                        )
                    )
                    .filter(Boolean),
                match.status_text || match.status ? `Estado: ${match.status_text || match.status}` : '',
                ATTRIBUTION,
            ]
                .filter(Boolean)
                .join('\n')
            await notify(message)
        }
        if (eventDetected || scoreChanged || statusChanged) {
            await store.updateProgress(fixtureKey, progress)
        }
    }
}

module.exports = {
    checkWatchedMatches,
    classifyMatchStatus,
    getBetProgress,
    getFixtureKey,
    getWatchKey,
    normalizeTeamName,
    normalizeWatchedMatch,
    parsePrediction,
}
