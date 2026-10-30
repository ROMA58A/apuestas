const test = require('node:test')
const assert = require('node:assert/strict')
const {
    getProfitTimeMessage,
    getWhatsAppDestination,
    sendBotActiveMessage,
    sendScheduledReminder,
} = require('../app')

test('reports the configured time without reading finance data', () => {
    const message = getProfitTimeMessage()
    assert.match(message, /^La hora programada para sacar ganancias es \d{2}:\d{2} \(.+\)\.$/)
})

test('normalizes the WhatsApp destination to digits for the provider', () => {
    assert.equal(getWhatsAppDestination(), process.env.WHATSAPP_DESTINATION.replace(/^\+/, ''))
})

test('sends the scheduled reminder with the options object required by the provider', async () => {
    let sent
    const provider = {
        sendMessage: async (...args) => {
            sent = args
        },
    }

    await sendScheduledReminder(provider)

    assert.equal(sent[0], getWhatsAppDestination())
    assert.match(sent[1], /Es hora de sacar ganancias/)
    assert.match(sent[1], /\d{2}:\d{2}/)
    assert.deepEqual(sent[2], { options: {} })
})

test('sends a WhatsApp confirmation when the bot is active', async () => {
    let sent
    const provider = {
        sendMessage: async (...args) => {
            sent = args
        },
    }

    await sendBotActiveMessage(provider)

    assert.equal(sent[0], getWhatsAppDestination())
    assert.match(sent[1], /El bot está activo y funcionando/)
    assert.deepEqual(sent[2], { options: {} })
})
