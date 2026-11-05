const fs = require('node:fs')
const path = require('node:path')

const providerPath = require.resolve('@bot-whatsapp/provider/web-whatsapp')
const source = fs.readFileSync(providerPath, 'utf8')
const original = '    await cleanImage(PATH_QR);'
const replacement = `    try {
        await cleanImage(PATH_QR);
    } catch (error) {
        console.warn('No se pudo optimizar el QR; se conserva la imagen original:', error.message);
    }`

if (!source.includes(original)) {
    throw new Error(`No se encontró el limpiador QR esperado en ${path.basename(providerPath)}`)
}

let patchedSource = source.replace(original, replacement)
const browserArgs = "['--no-sandbox', '--disable-setuid-sandbox', '--unhandled-rejections=strict']"
const optimizedBrowserArgs = "['--no-sandbox', '--disable-setuid-sandbox', '--unhandled-rejections=strict', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--no-first-run', '--disable-background-networking']"

if (!patchedSource.includes(optimizedBrowserArgs)) {
    if (!patchedSource.includes(browserArgs)) {
        throw new Error('No se encontraron los argumentos de Chromium esperados')
    }
    patchedSource = patchedSource.replace(browserArgs, optimizedBrowserArgs)
}

fs.writeFileSync(providerPath, patchedSource)
