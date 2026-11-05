# Panel de partidos (Laravel)

Panel local para importar pronósticos, consultar el seguimiento del bot y registrar resultados. No se conecta directamente a la base: utiliza la API Node del bot, que guarda toda la información en MongoDB Atlas.

## Requisitos e inicio

Requiere PHP 8.3 o posterior, Composer, Node.js y npm. Desde esta carpeta ejecuta:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
composer install
php artisan key:generate
npm install
npm run build
php artisan serve
```

Abre `http://127.0.0.1:8000`. Configura `MATCH_API_URL` (por defecto `http://127.0.0.1:3001`) en el `.env` del panel. Si la API usa `MATCH_API_TOKEN`, configura el mismo token localmente en Laravel; el navegador no lo recibe.

## Correos de resultados

El panel envía los resultados de fútbol cada minuto a `RESULTS_EMAIL` (por defecto,
`ayalarodriguer59@gmail.com`). Configura SMTP en `.env`; para Gmail usa una contraseña
de aplicación, no la contraseña normal:

```env
RESULTS_EMAIL=ayalarodriguer59@gmail.com
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=tu-cuenta@gmail.com
MAIL_PASSWORD=tu-contraseña-de-aplicación
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=tu-cuenta@gmail.com
```

En otra terminal, deja activo el programador:

```powershell
php artisan schedule:work
```

La API configurada en `MATCH_API_URL` debe estar disponible para consultar los marcadores.

## Importar pronósticos

En el panel puedes subir PDF con texto seleccionable, TXT o DOCX (máximo 2 MB), o pegar una tabla con las columnas hora, liga, partido, pronóstico y porcentaje. El importador conserva cada dato y admite varias apuestas para un mismo encuentro. Los encabezados de fecha como `VIERNES 30 OCT` asignan la fecha a las filas siguientes; si el archivo omite el año, se usa el año actual. Las horas se conservan como hora local tal como aparecen en la tabla.

También puedes añadir un partido manualmente y especificar pronóstico, fecha/hora y porcentaje. El bot envía avisos de inicio, medio tiempo, goles y final; evalúa automáticamente `Equipo gana`, `Empate`, `Más de X goles` y `Menos de X goles`. Los pronósticos no compatibles se conservan, pero se indican como no evaluables automáticamente.

Los PDF escaneados como imagen necesitan OCR y no se pueden importar todavía.

## Pruebas

```powershell
php artisan test
```
