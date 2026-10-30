const test = require('node:test')
const assert = require('node:assert/strict')
const { checkWatchedMatches, getBetProgress } = require('../match-watch')

test('notifies when the watched score increases from 0-0', async () => {
    const watch = {
        id: 1,
        homeTeam: 'America',
        awayTeam: 'Cruz Azul',
        competition: 'Liga MX',
        prediction: 'América gana',
        fixtureKey: 'fixture-1',
        lastHomeScore: 0,
        lastAwayScore: 0,
        lastStatus: 'pending',
        startedNotified: false,
        halftimeNotified: false,
        finishedNotified: false,
    }
    const scores = []
    const messages = []
    const store = {
        list: async () => [watch],
        updateProgress: async (fixtureKey, progress) => {
            scores.push({ fixtureKey, ...progress })
            Object.assign(watch, progress)
        },
    }
    let payload = {
        matches: [
            {
                home: 'América',
                away: 'Cruz Azul',
                competition: 'Liga MX',
                home_score: '0',
                away_score: '0',
                status_text: 'Live',
            },
        ],
    }
    const check = () =>
        checkWatchedMatches({
            store,
            loadMatches: async () => payload,
            notify: async (message) => messages.push(message),
        })

    payload.matches[0].home_score = '1'
    await check()
    assert.equal(messages.length, 1)
    assert.match(messages[0], /América 1-0 Cruz Azul/)
    assert.match(messages[0], /va ganando America/)
    assert.match(messages[0], /Powered by SportScore/)
    assert.equal(scores.at(-1).fixtureKey, 'fixture-1')
    assert.equal(scores.at(-1).lastHomeScore, 1)
})

test('does not request scores while the follow list is empty', async () => {
    let requested = false
    await checkWatchedMatches({
        store: { list: async () => [] },
        loadMatches: async () => {
            requested = true
            return { matches: [] }
        },
        notify: async () => {},
    })
    assert.equal(requested, false)
})

test('does not advance saved scores if WhatsApp notification fails', async () => {
    const watch = {
        id: 2,
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        competition: null,
        lastHomeScore: 0,
        lastAwayScore: 0,
    }
    let updates = 0
    await assert.rejects(
        checkWatchedMatches({
            store: {
                list: async () => [watch],
                updateProgress: async () => {
                    updates += 1
                },
            },
            loadMatches: async () => ({
                matches: [{ home: 'Team A', away: 'Team B', home_score: 1, away_score: 0 }],
            }),
            notify: async () => {
                throw new Error('WhatsApp no disponible')
            },
        }),
        /WhatsApp no disponible/
    )
    assert.equal(updates, 0)
})

test('reports when a goal threshold is met and settles it only at full time', () => {
    const watched = { prediction: 'Más de 1.5 goles' }
    const match = { home: 'Team A', away: 'Team B' }

    assert.match(getBetProgress(watched, match, 'live', 1, 1), /pronóstico cumplido/)
    assert.match(getBetProgress(watched, match, 'finished', 1, 1), /Apuesta ganada/)
    assert.match(getBetProgress(watched, match, 'live', 0, 0), /faltan 2 goles/)
})

test('sends kickoff, halftime, and final updates once with the settled bet status', async () => {
    const watch = {
        id: '507f1f77bcf86cd799439011',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        competition: 'League',
        prediction: 'Team A gana',
        fixtureKey: 'fixture-2',
        lastHomeScore: 0,
        lastAwayScore: 0,
        lastStatus: 'pending',
        startedNotified: false,
        halftimeNotified: false,
        finishedNotified: false,
    }
    const messages = []
    const store = {
        list: async () => [watch],
        updateProgress: async (_, progress) => Object.assign(watch, progress),
    }
    let currentMatch = {
        home: 'Team A',
        away: 'Team B',
        competition: 'League',
        home_score: 0,
        away_score: 0,
        status_text: 'Live',
    }
    const check = () =>
        checkWatchedMatches({
            store,
            loadMatches: async () => ({ matches: [currentMatch] }),
            notify: async (message) => messages.push(message),
        })

    await check()
    currentMatch = { ...currentMatch, status_text: 'HT', home_score: 1 }
    await check()
    await check()
    currentMatch = { ...currentMatch, status_text: 'Full Time', away_score: 0 }
    await check()

    assert.equal(messages.length, 3)
    assert.match(messages[0], /acaba de iniciar/)
    assert.match(messages[1], /Medio tiempo/)
    assert.match(messages[2], /Apuesta ganada/)
    assert.equal(watch.finishedNotified, true)
})

test('does not settle a match until SportScore supplies its final score', async () => {
    const watch = {
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        competition: 'League',
        prediction: 'Team A gana',
        fixtureKey: 'fixture-3',
        lastHomeScore: 0,
        lastAwayScore: 0,
        lastStatus: 'live',
        startedNotified: true,
        halftimeNotified: false,
        finishedNotified: false,
    }
    const messages = []
    const store = {
        list: async () => [watch],
        updateProgress: async (_, progress) => Object.assign(watch, progress),
    }
    let currentMatch = {
        home: 'Team A',
        away: 'Team B',
        competition: 'League',
        home_score: null,
        away_score: null,
        status_text: 'Full Time',
    }
    const check = () =>
        checkWatchedMatches({
            store,
            loadMatches: async () => ({ matches: [currentMatch] }),
            notify: async (message) => messages.push(message),
        })

    await check()
    await check()
    assert.equal(messages.length, 1)
    assert.match(messages[0], /marcador final/)
    assert.doesNotMatch(messages[0], /Apuesta ganada|Apuesta perdida/)

    currentMatch = { ...currentMatch, home_score: 1, away_score: 0 }
    await check()
    assert.equal(messages.length, 2)
    assert.match(messages[1], /Apuesta ganada/)
})
