const path = require('node:path')
const dotenv = require('dotenv')
const { MongoClient } = require('mongodb')
const { createMongoIndexes } = require('./mongo-storage')

const loadConfiguration = () => {
    const credentialsFile = process.env.ATLAS_CREDENTIALS_FILE
    const result = dotenv.config(
        credentialsFile
            ? { path: path.resolve(credentialsFile), override: false }
            : { path: path.join(__dirname, '.env'), override: false }
    )
    if (result.error && result.error.code !== 'ENOENT') {
        throw result.error
    }

    const uri = process.env.MONGODB_URI
    if (!uri) {
        throw new Error(
            'Falta MONGODB_URI. Configúrala en .env o indica ATLAS_CREDENTIALS_FILE.'
        )
    }
    return {
        uri,
        databaseName: process.env.MONGODB_DB_NAME || 'bot_whatsapp',
    }
}

const setupDatabase = async ({
    MongoClientClass = MongoClient,
    uri,
    databaseName,
}) => {
    const client = new MongoClientClass(uri)
    try {
        await client.connect()
        const database = client.db(databaseName)
        await database.command({ ping: 1 })

        for (const name of ['history', 'match_results', 'match_watchlist']) {
            const exists = await database.listCollections({ name }, { nameOnly: true }).hasNext()
            if (!exists) await database.createCollection(name)
        }

        await createMongoIndexes(database)
        console.log(`MongoDB Atlas listo: base "${databaseName}" y colecciones verificadas.`)
    } finally {
        await client.close()
    }
}

if (require.main === module) {
    try {
        setupDatabase(loadConfiguration()).catch((error) => {
            const uri = process.env.MONGODB_URI
            const message = uri ? error.message.replaceAll(uri, '[MONGODB_URI]') : error.message
            console.error('No se pudo preparar MongoDB Atlas:', message)
            process.exitCode = 1
        })
    } catch (error) {
        console.error('No se pudo preparar MongoDB Atlas:', error.message)
        process.exitCode = 1
    }
}

module.exports = { loadConfiguration, setupDatabase }
