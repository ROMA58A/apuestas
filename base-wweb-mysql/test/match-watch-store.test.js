const test = require('node:test')
const assert = require('node:assert/strict')
const { createMongoMatchWatchStore } = require('../mongo-storage')

test('upserts each distinct prediction separately while preserving its watch state', async () => {
    let upsertOperations
    const saved = new Map()
    const collection = {
        bulkWrite: async (operations) => {
            upsertOperations = operations
            for (const { updateOne } of operations) {
                if (!saved.has(updateOne.filter.watchKey)) {
                    saved.set(updateOne.filter.watchKey, {
                        _id: { toString: () => String(saved.size + 1) },
                        ...updateOne.update.$setOnInsert,
                    })
                }
            }
        },
        find: (filter) => ({
            toArray: async () => [...saved.values()].filter((item) =>
                filter.watchKey.$in.includes(item.watchKey)
            ),
        }),
        updateMany: async () => {},
        deleteOne: async () => ({ deletedCount: 0 }),
    }
    const store = createMongoMatchWatchStore(collection)
    const match = {
        homeTeam: 'América',
        awayTeam: 'Cruz Azul',
        competition: 'Liga MX',
        prediction: 'América gana',
        confidence: 80,
        kickoffAt: '2026-10-30T12:00:00',
    }

    const created = await store.create([match, { ...match, prediction: 'Más de 1.5 goles' }])

    assert.equal(created.length, 2)
    assert.notEqual(created[0].watchKey, created[1].watchKey)
    assert.equal(upsertOperations[0].updateOne.update.$setOnInsert.lastHomeScore, 0)
    assert.equal(upsertOperations[0].updateOne.update.$setOnInsert.startedNotified, false)
    assert.equal(upsertOperations[0].updateOne.update.$setOnInsert.prediction, 'América gana')
})
