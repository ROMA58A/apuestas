const { ObjectId } = require('mongodb')
const { getFixtureKey, getWatchKey } = require('./match-watch')

const toWatchMatch = (document) => {
    const { _id, ...match } = document
    return { id: _id.toString(), ...match }
}

const createMongoMatchWatchStore = (collection) => ({
    list: async () => {
        const documents = await collection.find({}).sort({ kickoffAt: 1, _id: 1 }).toArray()
        return documents.map(toWatchMatch)
    },
    create: async (matches) => {
        const watchKeys = matches.map(getWatchKey)
        await collection.bulkWrite(
            matches.map((match, index) => {
                const fixtureKey = getFixtureKey(match)
                return {
                    updateOne: {
                        filter: { watchKey: watchKeys[index] },
                        update: {
                            $setOnInsert: {
                                ...match,
                                fixtureKey,
                                watchKey: watchKeys[index],
                                lastHomeScore: 0,
                                lastAwayScore: 0,
                                lastStatus: null,
                                startedNotified: false,
                                halftimeNotified: false,
                                finishedNotified: false,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            },
                        },
                        upsert: true,
                    },
                }
            }),
            { ordered: true }
        )
        const documents = await collection.find({ watchKey: { $in: watchKeys } }).toArray()
        const byKey = new Map(documents.map((document) => [document.watchKey, document]))
        return watchKeys.map((watchKey) => toWatchMatch(byKey.get(watchKey)))
    },
    remove: async (id) => {
        if (!ObjectId.isValid(id)) return false
        const result = await collection.deleteOne({ _id: new ObjectId(id) })
        return result.deletedCount > 0
    },
    updateProgress: async (fixtureKey, progress) => {
        await collection.updateMany(
            { fixtureKey },
            { $set: { ...progress, updatedAt: new Date() } }
        )
    },
})

const createMongoMatchResultsStore = (collection) => ({
    list: async ({ limit, offset, team, competition }) => {
        const filters = {}
        if (team) {
            filters.$or = [{ homeTeam: team }, { awayTeam: team }]
        }
        if (competition) filters.competition = competition
        const documents = await collection
            .find(filters)
            .sort({ playedAt: -1, _id: -1 })
            .skip(offset)
            .limit(limit)
            .toArray()
        return documents.map(({ _id, ...match }) => ({ id: _id.toString(), ...match }))
    },
    create: async (matches) => {
        const documents = matches.map((match) => ({ ...match, createdAt: new Date() }))
        const result = await collection.insertMany(documents, { ordered: true })
        return documents.map((match, index) => ({
            id: result.insertedIds[index].toString(),
            ...match,
        }))
    },
})

const createMongoHistoryAdapter = (collection) => {
    const adapter = {
        listHistory: [],
        getPrevByNumber: async (from) => {
            const previous = await collection.find({ from }).sort({ _id: -1 }).limit(1).next()
            return previous || null
        },
        save: async (context) => {
            const document = { ...context, date: new Date() }
            await collection.insertOne(document)
            adapter.listHistory.push(context)
        },
    }
    return adapter
}

const createMongoIndexes = async (db) => {
    await Promise.all([
        db.collection('match_watchlist').createIndex({ watchKey: 1 }, { unique: true }),
        db.collection('match_watchlist').createIndex({ fixtureKey: 1 }),
        db.collection('match_results').createIndex({ playedAt: -1 }),
    ])
}

module.exports = {
    createMongoHistoryAdapter,
    createMongoIndexes,
    createMongoMatchResultsStore,
    createMongoMatchWatchStore,
}
