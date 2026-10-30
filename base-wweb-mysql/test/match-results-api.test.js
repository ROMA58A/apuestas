const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const {
    createMatchResultsServer,
} = require('../match-results-api')

const startServer = async (store, token, loadLiveMatches, watchStore) => {
    const server = createMatchResultsServer({ store, token, loadLiveMatches, watchStore })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address()
    return { server, baseUrl: `http://127.0.0.1:${port}` }
}

test('creates a match and stores its normalized values', async (t) => {
    const createdMatches = []
    const { server, baseUrl } = await startServer({
        list: async () => [],
        create: async (matches) => {
            createdMatches.push(...matches)
            return matches.map((match, index) => ({ id: index + 1, ...match }))
        },
    })
    t.after(() => server.close())

    const response = await fetch(`${baseUrl}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            homeTeam: ' América ',
            awayTeam: 'Cruz Azul',
            homeScore: 2,
            awayScore: 1,
            competition: 'Liga MX',
            playedAt: '2026-10-29',
        }),
    })

    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), {
        matches: [
            {
                id: 1,
                homeTeam: 'América',
                awayTeam: 'Cruz Azul',
                homeScore: 2,
                awayScore: 1,
                competition: 'Liga MX',
                playedAt: '2026-10-29 00:00:00',
            },
        ],
    })
    assert.equal(createdMatches.length, 1)
})

test('accepts multiple matches and rejects invalid scores before saving', async (t) => {
    let savedCount = 0
    const { server, baseUrl } = await startServer({
        list: async () => [],
        create: async (matches) => {
            savedCount += matches.length
            return matches
        },
    })
    t.after(() => server.close())

    const validMatch = {
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        homeScore: 0,
        awayScore: 0,
        playedAt: '2026-10-28T19:30:00Z',
    }
    const bulkResponse = await fetch(`${baseUrl}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: [validMatch, { ...validMatch, awayTeam: 'Team C' }] }),
    })
    assert.equal(bulkResponse.status, 201)
    assert.equal((await bulkResponse.json()).matches.length, 2)

    const invalidResponse = await fetch(`${baseUrl}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ ...validMatch, homeScore: -1 }]),
    })
    assert.equal(invalidResponse.status, 400)
    assert.equal(savedCount, 2)
})

test('lists matches and requires the configured bearer token', async (t) => {
    let query
    const { server, baseUrl } = await startServer(
        {
            list: async (filters) => {
                query = filters
                return [{ id: 7 }]
            },
            create: async () => [],
        },
        'test-token'
    )
    t.after(() => server.close())

    const unauthorized = await fetch(`${baseUrl}/api/matches`)
    assert.equal(unauthorized.status, 401)

    const response = await fetch(`${baseUrl}/api/matches?team=Am%C3%A9rica&limit=10&offset=2`, {
        headers: { Authorization: 'Bearer test-token' },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { matches: [{ id: 7 }] })
    assert.deepEqual(query, {
        limit: 10,
        offset: 2,
        team: 'América',
        competition: null,
    })
})

test('returns live SportScore matches with attribution', async (t) => {
    let query
    const { server, baseUrl } = await startServer(
        {
            list: async () => [],
            create: async () => [],
        },
        null,
        async (filters) => {
            query = filters
            return { sport: 'football', count: 1, matches: [{ home: 'Equipo A' }] }
        }
    )
    t.after(() => server.close())
    const response = await fetch(`${baseUrl}/api/matches/live?sport=football&limit=5`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
        sport: 'football',
        count: 1,
        matches: [{ home: 'Equipo A' }],
        attribution: 'Powered by SportScore — https://sportscore.com/',
    })

    test('exposes an unauthenticated health check for Render', async (t) => {
        const { server, baseUrl } = await startServer(
            { list: async () => [], create: async () => [] },
            'private-api-token'
        )
        t.after(() => server.close())

        const response = await fetch(`${baseUrl}/health`)

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { status: 'ok' })
    })
    assert.deepEqual(query, { sport: 'football', limit: 5 })
})

test('rejects invalid live-score limits without calling SportScore', async (t) => {
    let called = false
    const { createMatchResultsServer } = require('../match-results-api')
    const server = createMatchResultsServer({
        store: { list: async () => [], create: async () => [] },
        loadLiveMatches: async () => {
            called = true
            return { matches: [] }
        },
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => server.close())
    const { port } = server.address()

    const response = await fetch(`http://127.0.0.1:${port}/api/matches/live?limit=51`)
    assert.equal(response.status, 400)
    assert.equal(called, false)
})

test('uploads, lists, and removes followed matches', async (t) => {
    const matches = []
    const id = '507f1f77bcf86cd799439011'
    const watchStore = {
        list: async () => matches,
        create: async (items) => {
            const created = items.map((match) => ({ id, ...match }))
            matches.push(...created)
            return created
        },
        remove: async (id) => {
            const index = matches.findIndex((match) => match.id === id)
            if (index < 0) return false
            matches.splice(index, 1)
            return true
        },
    }
    const { server, baseUrl } = await startServer(
        { list: async () => [], create: async () => [] },
        null,
        undefined,
        watchStore
    )
    t.after(() => server.close())

    const upload = await fetch(`${baseUrl}/api/matches/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            matches: [{
                homeTeam: ' América ',
                awayTeam: 'Cruz Azul',
                competition: 'Liga MX',
                prediction: 'América gana',
                confidence: 80,
                kickoffAt: '2026-10-30T12:00:00',
            }],
        }),
    })
    assert.equal(upload.status, 201)
    assert.deepEqual((await upload.json()).matches, [
        {
            id,
            homeTeam: 'América',
            awayTeam: 'Cruz Azul',
            competition: 'Liga MX',
            prediction: 'América gana',
            confidence: 80,
            kickoffAt: '2026-10-30T12:00:00',
        },
    ])

    const listResponse = await fetch(`${baseUrl}/api/matches/watch`)
    assert.equal(listResponse.status, 200)
    assert.equal((await listResponse.json()).matches.length, 1)

    const removeResponse = await fetch(`${baseUrl}/api/matches/watch/${id}`, { method: 'DELETE' })
    assert.equal(removeResponse.status, 200)
    assert.deepEqual(await removeResponse.json(), { removed: true })
})

test('rejects invalid bet confidence and kickoff before saving', async (t) => {
    let saved = false
    const { server, baseUrl } = await startServer(
        { list: async () => [], create: async () => [] },
        null,
        undefined,
        {
            list: async () => [],
            create: async () => {
                saved = true
                return []
            },
        }
    )
    t.after(() => server.close())
    const response = await fetch(`${baseUrl}/api/matches/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            homeTeam: 'Team A',
            awayTeam: 'Team B',
            prediction: 'Team A gana',
            confidence: 101,
            kickoffAt: '2026-10-30T12:00:00',
        }),
    })

    assert.equal(response.status, 400)
    assert.equal(saved, false)
})

test('rejects invalid followed matches', async (t) => {
    const { server, baseUrl } = await startServer(
        { list: async () => [], create: async () => [] },
        null,
        undefined,
        { list: async () => [], create: async () => [] }
    )
    t.after(() => server.close())

    const response = await fetch(`${baseUrl}/api/matches/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeam: '', awayTeam: 'Cruz Azul' }),
    })
    assert.equal(response.status, 400)
})

test('applies validated pagination and text filters to MongoDB queries', async () => {
    const { createMongoMatchResultsStore } = require('../mongo-storage')
    let query
    let sort
    let skip
    let limit
    const store = createMongoMatchResultsStore({
        find: (filters) => {
            query = filters
            return {
                sort: (value) => {
                    sort = value
                    return {
                        skip: (value) => {
                            skip = value
                            return {
                                limit: (value) => {
                                    limit = value
                                    return { toArray: async () => [] }
                                },
                            }
                        },
                    }
                },
            }
        },
    })

    await store.list({
        limit: 25,
        offset: 10,
        team: 'América',
        competition: 'Liga MX',
    })

    assert.deepEqual(query, {
        $or: [{ homeTeam: 'América' }, { awayTeam: 'América' }],
        competition: 'Liga MX',
    })
    assert.deepEqual(sort, { playedAt: -1, _id: -1 })
    assert.equal(skip, 10)
    assert.equal(limit, 25)
})
