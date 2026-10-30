require('dotenv').config()

const mysql = require('mysql2/promise')
const { MongoClient } = require('mongodb')
const { getFixtureKey, getWatchKey } = require('./match-watch')

const migrateCollection = async (collection, operations) => {
    for (let index = 0; index < operations.length; index += 500) {
        await collection.bulkWrite(operations.slice(index, index + 500), { ordered: true })
    }
    return operations.length
}

const parseOptions = (options) => {
    if (typeof options !== 'string') return options
    return JSON.parse(options)
}

const migrate = async () => {
    const required = ['MYSQL_DB_HOST', 'MYSQL_DB_USER', 'MYSQL_DB_NAME', 'MONGODB_URI']
    const missing = required.filter((name) => !process.env[name])
    if (missing.length) {
        throw new Error(`Faltan variables para la migración: ${missing.join(', ')}`)
    }

    const sql = mysql.createPool({
        host: process.env.MYSQL_DB_HOST,
        user: process.env.MYSQL_DB_USER,
        password: process.env.MYSQL_DB_PASSWORD || '',
        database: process.env.MYSQL_DB_NAME,
        port: Number(process.env.MYSQL_DB_PORT || 3306),
        waitForConnections: true,
        connectionLimit: 2,
    })
    const mongo = new MongoClient(process.env.MONGODB_URI)
    try {
        await mongo.connect()
        const db = mongo.db(process.env.MONGODB_DB_NAME || 'bot_whatsapp')
        const [historyRows] = await sql.execute(
            'SELECT id, ref, keyword, answer, refSerialize, phone, options, created_at FROM history ORDER BY id'
        )
        const [resultRows] = await sql.execute(
            'SELECT id, home_team, away_team, home_score, away_score, competition, played_at, created_at FROM match_results ORDER BY id'
        )
        const [watchRows] = await sql.execute(
            `SELECT id, home_team, away_team, competition, last_home_score, last_away_score,
                watch_key, created_at, updated_at
            FROM match_watchlist ORDER BY id`
        )

        const historyCount = await migrateCollection(
            db.collection('history'),
            historyRows.map((row) => ({
                updateOne: {
                    filter: { legacyMysqlId: row.id },
                    update: {
                        $setOnInsert: {
                            legacyMysqlId: row.id,
                            ref: row.ref,
                            keyword: row.keyword,
                            answer: row.answer,
                            refSerialize: row.refSerialize,
                            from: row.phone,
                            phone: row.phone,
                            options: parseOptions(row.options),
                            date: row.created_at,
                        },
                    },
                    upsert: true,
                },
            }))
        )
        const resultsCount = await migrateCollection(
            db.collection('match_results'),
            resultRows.map((row) => ({
                updateOne: {
                    filter: { legacyMysqlId: row.id },
                    update: {
                        $setOnInsert: {
                            legacyMysqlId: row.id,
                            homeTeam: row.home_team,
                            awayTeam: row.away_team,
                            homeScore: row.home_score,
                            awayScore: row.away_score,
                            competition: row.competition,
                            playedAt: row.played_at,
                            createdAt: row.created_at,
                        },
                    },
                    upsert: true,
                },
            }))
        )
        const watchCount = await migrateCollection(
            db.collection('match_watchlist'),
            watchRows.map((row) => {
                const match = {
                    homeTeam: row.home_team,
                    awayTeam: row.away_team,
                    competition: row.competition || '',
                    prediction: '',
                    confidence: null,
                    kickoffAt: null,
                }
                return {
                    updateOne: {
                        filter: { watchKey: getWatchKey(match) },
                        update: {
                            $setOnInsert: {
                                ...match,
                                legacyMysqlId: row.id,
                                fixtureKey: getFixtureKey(match),
                                watchKey: getWatchKey(match),
                                lastHomeScore: row.last_home_score,
                                lastAwayScore: row.last_away_score,
                                lastStatus: null,
                                startedNotified: false,
                                halftimeNotified: false,
                                finishedNotified: false,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at,
                            },
                        },
                        upsert: true,
                    },
                }
            })
        )
        console.log(
            `Migración completada: ${historyCount} registros de historial, ${resultsCount} resultados y ${watchCount} partidos procesados.`
        )
    } finally {
        await Promise.all([sql.end(), mongo.close()])
    }
}

migrate().catch((error) => {
    const uri = process.env.MONGODB_URI
    const message = uri ? error.message.replaceAll(uri, '[MONGODB_URI]') : error.message
    console.error('No se pudo completar la migración:', message)
    process.exitCode = 1
})
