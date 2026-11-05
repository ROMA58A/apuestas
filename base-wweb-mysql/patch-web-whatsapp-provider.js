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
const previousOptimizedBrowserArgs = "['--no-sandbox', '--disable-setuid-sandbox', '--unhandled-rejections=strict', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--no-first-run', '--disable-background-networking']"
const optimizedBrowserArgs = "['--no-sandbox', '--disable-setuid-sandbox', '--unhandled-rejections=strict', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--disable-extensions', '--no-first-run', '--disable-background-networking', '--single-process', '--no-zygote', '--renderer-process-limit=1', '--js-flags=--max_old_space_size=128']"

if (!patchedSource.includes(optimizedBrowserArgs)) {
    if (patchedSource.includes(previousOptimizedBrowserArgs)) {
        patchedSource = patchedSource.replace(previousOptimizedBrowserArgs, optimizedBrowserArgs)
    } else if (patchedSource.includes(browserArgs)) {
        patchedSource = patchedSource.replace(browserArgs, optimizedBrowserArgs)
    } else {
        throw new Error('No se encontraron los argumentos de Chromium esperados')
    }
}

fs.writeFileSync(providerPath, patchedSource)
