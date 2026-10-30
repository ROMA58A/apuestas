const test = require('node:test')
const assert = require('node:assert/strict')
const { createMongoHistoryAdapter } = require('../mongo-storage')

test('stores WhatsApp history and retrieves the latest message for a number', async () => {
    const records = []
    const collection = {
        insertOne: async (document) => records.push(document),
        find: (filter) => ({
            sort: () => ({
                limit: () => ({
                    next: async () => records.filter((record) => record.from === filter.from).at(-1),
                }),
            }),
        }),
    }
    const adapter = createMongoHistoryAdapter(collection)
    const context = {
        from: '50370000000',
        ref: 'message-1',
        keyword: 'hola',
        answer: 'Hola',
        refSerialize: 'serialized',
        options: {},
    }

    await adapter.save(context)

    assert.equal(records.length, 1)
    assert.ok(records[0].date instanceof Date)
    assert.deepEqual(await adapter.getPrevByNumber(context.from), records[0])
    assert.deepEqual(adapter.listHistory, [context])
})
