const fs = require('node:fs/promises')

const AMOUNT_FIELDS = ['monto', 'amount', 'value', 'val', 'valor', 'cantidad', 'm', 'ap']
const DATE_FIELDS = ['fecha', 'date', 'createdAt', 'created_at', 'timestamp', 'ts', 'f']

const parseAmount = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string' && value.trim() !== '') {
        const amount = Number(value)
        return Number.isFinite(amount) ? amount : null
    }
    return null
}

const getAmount = (entry, context) => {
    const directAmount = parseAmount(entry)
    if (directAmount !== null) return directAmount

    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        for (const field of AMOUNT_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(entry, field)) {
                const amount = parseAmount(entry[field])
                if (amount !== null) return amount
                break
            }
        }
    }

    throw new Error(`Importe inválido en ${context}`)
}

const getDateValue = (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    for (const field of DATE_FIELDS) {
        if (entry[field] !== undefined && entry[field] !== null && entry[field] !== '') {
            return entry[field]
        }
    }
    return null
}

const getLocalDate = (value, timeZone) => {
    if (value === null || value === undefined) return null

    let date
    if (typeof value === 'number') {
        date = new Date(value)
    } else if (typeof value === 'object' && typeof value.toDate === 'function') {
        date = value.toDate()
    } else if (typeof value === 'object' && Number.isFinite(value.seconds)) {
        date = new Date(value.seconds * 1000)
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const dateOnly = new Date(`${value}T00:00:00.000Z`)
        return Number.isNaN(dateOnly.getTime()) || dateOnly.toISOString().slice(0, 10) !== value
            ? null
            : value
    } else {
        date = new Date(value)
    }
    if (Number.isNaN(date.getTime())) return null

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const part = (type) => parts.find((item) => item.type === type).value
    return `${part('year')}-${part('month')}-${part('day')}`
}

const getScheduledDate = (date, timeZone) => getLocalDate(date.getTime(), timeZone)

const getTimeParts = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date)
    return {
        hour: parts.find((part) => part.type === 'hour').value,
        minute: parts.find((part) => part.type === 'minute').value,
    }
}

const getWeekStart = (date) => {
    const [year, month, day] = date.split('-').map(Number)
    const value = new Date(Date.UTC(year, month - 1, day))
    const offset = (value.getUTCDay() + 6) % 7
    value.setUTCDate(value.getUTCDate() - offset)
    return value.toISOString().slice(0, 10)
}

const getPeriod = (freq, today) =>
    freq === 'semana'
        ? { label: 'Esta semana', start: getWeekStart(today) }
        : { label: 'Hoy', start: today }

const isInPeriod = (entry, period, timeZone) => {
    const date = getLocalDate(getDateValue(entry), timeZone)
    return date !== null && date >= period.start && date <= period.end
}

const formatMoney = (value) =>
    new Intl.NumberFormat('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.abs(value))

const getBotName = (bot, index) => {
    const name = bot.nombre || bot.name || bot.n
    if (typeof name !== 'string' || name.trim() === '') {
        throw new Error(`Falta el nombre del bot ${index + 1}`)
    }
    return name.trim()
}

const normalizeItems = (data) => {
    const items =
        Array.isArray(data) ? data :
            data?.items || data?.fin?.inv?.items || data?.fin?.documents?.inv?.items ||
                data?.collections?.fin?.inv?.items

    if (!Array.isArray(items)) {
        throw new Error('La respuesta no contiene el arreglo fin/inv/items')
    }
    return items
}

const loadInvestmentItems = async () => {
    const endpoint = process.env.FINANZAS_API_URL
    const jsonPath = process.env.FINANZAS_JSON_PATH
    if (!endpoint && !jsonPath) {
        throw new Error('Configura FINANZAS_API_URL o FINANZAS_JSON_PATH')
    }

    if (endpoint) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
            const headers = { Accept: 'application/json' }
            if (process.env.FINANZAS_API_TOKEN) {
                headers.Authorization = `Bearer ${process.env.FINANZAS_API_TOKEN}`
            }
            const response = await fetch(endpoint, { headers, signal: controller.signal })
            if (!response.ok) throw new Error(`La API respondió HTTP ${response.status}`)
            return normalizeItems(await response.json())
        } finally {
            clearTimeout(timeout)
        }
    }

    return normalizeItems(JSON.parse(await fs.readFile(jsonPath, 'utf8')))
}

const buildProfitReminder = (rawItems, options = {}) => {
    const timeZone = options.timeZone || 'America/Mexico_City'
    const today = options.today || getScheduledDate(new Date(), timeZone)
    const bots = normalizeItems(rawItems).filter((item) => item && item.t === 'bot')
    const eligible = []
    const losses = []

    bots.forEach((bot, index) => {
        const name = getBotName(bot, index)
        if (
            !Array.isArray(bot.ap) ||
            parseAmount(bot.val) === null
        ) {
            throw new Error(`Datos incompletos para ${name}`)
        }

        const capital = bot.ap.reduce((sum, entry) => {
            if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'k')) {
                return sum
            }
            return sum + getAmount(entry, `capital de ${name}`)
        }, 0)
        const value = Number(bot.val)
        const available = value - capital
        const period = getPeriod(bot.freq, today)
        period.end = today
        for (const entry of bot.ap) {
            if (entry && ['res', 'gan'].includes(entry.k) && !getLocalDate(getDateValue(entry), timeZone)) {
                throw new Error(`Falta una fecha válida en el registro ${entry.k} de ${name}`)
            }
        }
        const periodEntries = bot.ap.filter(
            (entry) =>
                entry &&
                typeof entry === 'object' &&
                isInPeriod(entry, period, timeZone)
        )
        const result = periodEntries
            .filter((entry) => entry.k === 'res')
            .reduce((sum, entry) => sum + getAmount(entry, `resultado de ${name}`), 0)
        const alreadyWithdrew = periodEntries.some((entry) => entry.k === 'gan')

        if (value < capital) {
            losses.push(`⚠️ ${name}: va abajo $${formatMoney(capital - value)}. No saques; revisa el bot.`)
        }
        if (available > 0 && !alreadyWithdrew) {
            eligible.push({ name, available, capital, result, period: period.label })
        }
    })

    if (eligible.length === 0) return null

    const lines = [
        '💰 Toca sacar ganancia',
        ...eligible.map(({ name, available, capital, result, period }) => {
            const sign = result < 0 ? '−' : '+'
            return `• ${name}: $${formatMoney(available)} disponibles\n  ${period}: ${sign}$${formatMoney(result)} · Capital: $${formatMoney(capital)}`
        }),
        `Total a sacar: $${formatMoney(eligible.reduce((sum, bot) => sum + bot.available, 0))}`,
        'Al sacarla, anótala en la app con "Sacar ganancia".',
    ]
    if (losses.length) lines.push(...losses)
    return lines.join('\n')
}

module.exports = {
    buildProfitReminder,
    getLocalDate,
    getScheduledDate,
    getTimeParts,
    loadInvestmentItems,
    normalizeItems,
}
