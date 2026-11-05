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

fs.writeFileSync(providerPath, source.replace(original, replacement))
