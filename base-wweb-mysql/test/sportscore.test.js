const test = require('node:test')
const assert = require('node:assert/strict')
const {
    ATTRIBUTION,
    SportScoreError,
    fetchSportScoreMatches,
    formatSportScoreMatches,
} = require('../sportscore')

test('requests live and recent football matches from the SportScore endpoint', async () => {
    let requestUrl
    let requestOptions
    const payload = { sport: 'football', matches: [] }
    const response = await fetchSportScoreMatches({
        sport: 'football',
        limit: 8,
        baseUrl: 'https://sportscore.example',
        fetchImpl: async (url, options) => {
            requestUrl = url
            requestOptions = options
            return { ok: true, json: async () => payload }
        },
    })

    assert.equal(requestUrl.href, 'https://sportscore.example/api/widget/matches/?sport=football&limit=8')
    assert.equal(requestOptions.headers.Accept, 'application/json')
    assert.equal(requestOptions.headers['User-Agent'].includes('sportscore.com'), true)
    assert.equal(response, payload)
})

test('rejects unsupported sports and malformed provider responses', async () => {
    await assert.rejects(
        fetchSportScoreMatches({ sport: 'hockey', fetchImpl: async () => ({}) }),
        SportScoreError
    )
    await assert.rejects(
        fetchSportScoreMatches({
            fetchImpl: async () => ({ ok: true, json: async () => ({ matches: null }) }),
        }),
        /no contiene partidos/
    )
})

test('formats scores and preserves SportScore attribution', () => {
    const message = formatSportScoreMatches({
        matches: [
            {
                home: 'Local',
                away: 'Visitante',
                home_score: '2',
                away_score: '1',
                status_text: 'Live',
                competition: 'Liga',
            },
        ],
    })
    assert.match(message, /Local 2-1 Visitante/)
    assert.match(message, /Live · Liga/)
    assert.ok(message.endsWith(ATTRIBUTION))
})
