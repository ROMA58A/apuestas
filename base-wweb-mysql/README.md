# Bot de WhatsApp para seguimiento de apuestas y partidos

El bot conserva los recordatorios de ganancias y usa MongoDB Atlas para guardar el historial de WhatsApp, los resultados y las apuestas en seguimiento. El panel Laravel `panel-partidos` permite pegar o subir una tabla de pronósticos; cada fila conserva fecha/hora, liga, equipos, pronóstico y porcentaje.

## Avisos de seguimiento

El bot consulta SportScore cada minuto para cada partido importado. Envía un WhatsApp cuando detecta el inicio, el descanso, un gol y el resultado final. En los avisos muestra el marcador y el estado de cada pronóstico:

- `Equipo gana`: indica si el equipo va ganando o qué necesita para terminar arriba.
- `Empate`: indica si el marcador está igualado o si falta empatarlo.
- `Más de X goles` / `Menos de X goles`: informa cuántos goles faltan o si el pronóstico ya se cumplió/falló.
- En el resultado final liquida los pronósticos reconocidos como apuesta ganada o perdida. Un texto que no coincida con esos tipos se conserva y se marca claramente como no evaluable automáticamente.

El porcentaje es informativo, no altera la liquidación. Si una apuesta tiene varios pronósticos para el mismo partido, se guardan por separado y se muestran juntos. Los equipos deben coincidir con los nombres publicados por SportScore. La fuente puede no informar el minuto o el autor de cada gol.

## API de partidos

La API escucha por defecto en `http://127.0.0.1:3001`; el portal QR usa `3000`.

- `GET /api/matches/live`: marcadores de SportScore; acepta `sport` (`football`, `basketball`, `cricket` o `tennis`) y `limit` (1-50).
- `GET /api/matches`: resultados guardados; acepta `limit`, `offset`, `team` y `competition`.
- `POST /api/matches`: guarda resultados manuales con `homeTeam`, `awayTeam`, `homeScore`, `awayScore` y `playedAt`.
- `POST /api/matches/watch`: agrega pronósticos al seguimiento. Ejemplo:

```json
{
  "matches": [{
    "homeTeam": "Le Havre",
    "awayTeam": "PSG",
    "competition": "Ligue 1",
    "prediction": "PSG gana",
    "confidence": 80,
    "kickoffAt": "2026-10-30T12:00:00"
  }]
}
```

`prediction`, `confidence` y `kickoffAt` son opcionales para partidos agregados manualmente. `kickoffAt` conserva la hora local de la tabla y es informativo; los avisos de inicio dependen del estado publicado por SportScore. Se aceptan hasta 100 partidos por solicitud.

- `GET /api/matches/watch`: lista apuestas y estado guardado.
- `DELETE /api/matches/watch/{id}`: elimina una apuesta del seguimiento.

`database.sql` es el esquema de origen de MySQL para migrar una instalación anterior; la aplicación ya no crea ni usa tablas MySQL durante su operación normal.

## MongoDB Atlas

1. Copia `.env.example` a `.env`.
2. En Atlas, crea un usuario de base de datos y autoriza la IP donde se ejecutará el bot.
3. En **Connect → Drivers**, copia la URI de MongoDB en `MONGODB_URI` dentro del `.env` local. No subas ese archivo ni compartas la URI.
4. Configura `MONGODB_DB_NAME=apuestas` y las demás variables necesarias. Si vas a migrar datos MySQL, ejecuta primero el migrador descrito abajo, antes del primer inicio del bot. Después inicia con `npm install` y `npm start`.

El bot crea las colecciones `history`, `match_results` y `match_watchlist` e índices al arrancar.

### Migrar datos de una instalación MySQL anterior

El migrador copia el historial de WhatsApp, los resultados y la lista de seguimiento, de forma idempotente. Conserva la base MySQL original: no la borres hasta verificar los datos en Atlas.

Configura en el `.env` local `MYSQL_DB_HOST`, `MYSQL_DB_USER`, `MYSQL_DB_PASSWORD`, `MYSQL_DB_NAME` y `MYSQL_DB_PORT` para la base anterior, además de `MONGODB_URI` y `MONGODB_DB_NAME`. Después ejecuta:

```powershell
npm run migrate:mysql-to-mongodb
```

El migrador no se ejecuta al iniciar el bot. No pegues ni subas credenciales.

## Otras variables

| Variable | Descripción |
| --- | --- |
| `WHATSAPP_DESTINATION` | Número de WhatsApp destinatario en formato internacional. |
| `MONGODB_URI` | URI privada de conexión de MongoDB Atlas. |
| `MONGODB_DB_NAME` | Nombre de la base MongoDB; por defecto `apuestas`. |
| `MATCH_API_HOST` / `MATCH_API_PORT` | Interfaz y puerto de la API; por defecto `127.0.0.1:3001`. |
| `MATCH_API_TOKEN` | Token para proteger la API si se expone fuera del equipo local. |
| `PORT` | Puerto inicial del portal QR; por defecto `3000`. |
| `SPORTSCORE_API_BASE` | URL base de SportScore; por defecto `https://sportscore.com`. |
| `CHECK_TIME` / `TIME_ZONE` | Hora y zona horaria del recordatorio de ganancias. |

No expongas la API directamente a Internet; utiliza HTTPS y controles de acceso. SportScore es una API pública: se conserva la atribución `Powered by SportScore`.

En Windows puedes iniciar con `.\run.ps1`; el proceso debe permanecer activo y WhatsApp conectado para enviar avisos. Ejecuta `npm test` para las pruebas de Node.js. El panel tiene sus propias instrucciones y pruebas en `panel-partidos/README.md`.
