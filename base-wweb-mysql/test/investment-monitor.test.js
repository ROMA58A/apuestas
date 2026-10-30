const test = require('node:test')
const assert = require('node:assert/strict')
const { buildProfitReminder } = require('../investment-monitor')

const today = '2026-10-29'

test('reports only bots with positive available profit and no withdrawal this period', () => {
    const message = buildProfitReminder(
        [
            {
                t: 'bot',
                nombre: 'Bot A',
                val: 1300,
                ap: [
                    { monto: 1000 },
                    { monto: 25, k: 'res', fecha: today },
                    { monto: 200, k: 'gan', fecha: '2026-10-28' },
                ],
            },
            {
                t: 'bot',
                nombre: 'Bot B',
                val: 1200,
                ap: [{ monto: 1000 }, { monto: 100, k: 'gan', fecha: today }],
            },
            { t: 'otro', nombre: 'Ignorado', val: 5000, ap: [{ monto: 1 }] },
        ],
        { today, timeZone: 'UTC' }
    )

    assert.equal(
        message,
        [
            '💰 Toca sacar ganancia',
            '• Bot A: $300.00 disponibles',
            '  Hoy: +$25.00 · Capital: $1,000.00',
            'Total a sacar: $300.00',
            'Al sacarla, anótala en la app con "Sacar ganancia".',
        ].join('\n')
    )
})

test('uses the Monday-based current week for weekly bots and includes loss warnings', () => {
    const message = buildProfitReminder(
        [
            {
                t: 'bot',
                nombre: 'Bot semanal',
                freq: 'semana',
                val: 150,
                ap: [
                    { monto: 100 },
                    { monto: -5, k: 'res', fecha: '2026-10-26' },
                ],
            },
            {
                t: 'bot',
                nombre: 'Bot en pérdida',
                val: 75,
                ap: [{ monto: 100 }],
            },
        ],
        { today, timeZone: 'UTC' }
    )

    assert.match(message, /Esta semana: −\$5\.00/)
    assert.match(message, /⚠️ Bot en pérdida: va abajo \$25\.00/)
})

test('does not send a reminder when there is no eligible profit', () => {
    const message = buildProfitReminder(
        [{ t: 'bot', nombre: 'Bot', val: 100, ap: [{ monto: 100 }] }],
        { today, timeZone: 'UTC' }
    )
    assert.equal(message, null)
})

test('does not remind a weekly bot after a withdrawal earlier in the current week', () => {
    const message = buildProfitReminder(
        [
            {
                t: 'bot',
                nombre: 'Bot semanal',
                freq: 'semana',
                val: 150,
                ap: [
                    { monto: 100 },
                    { monto: 20, k: 'gan', fecha: '2026-10-26' },
                ],
            },
        ],
        { today, timeZone: 'UTC' }
    )
    assert.equal(message, null)
})

test('rejects incomplete bot data instead of reporting invented values', () => {
    assert.throws(
        () =>
            buildProfitReminder(
                [{ t: 'bot', nombre: 'Bot', val: 100 }],
                { today, timeZone: 'UTC' }
            ),
        /Datos incompletos/
    )
})

test('rejects withdrawals without dates because the current period cannot be verified', () => {
    assert.throws(
        () =>
            buildProfitReminder(
                [
                    {
                        t: 'bot',
                        nombre: 'Bot',
                        val: 150,
                        ap: [{ monto: 100 }, { monto: 10, k: 'gan' }],
                    },
                ],
                { today, timeZone: 'UTC' }
            ),
        /Falta una fecha válida en el registro gan/
    )
})
