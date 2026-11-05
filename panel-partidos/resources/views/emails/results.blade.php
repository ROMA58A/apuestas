<!doctype html>
<html lang="es">
<body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:10px;padding:28px">
<tr><td>
<h1 style="margin:0 0 8px;color:#0f766e">Resultados de tus partidos</h1>
<p style="color:#6b7280">Actualizado el {{ $sentAt->format('d/m/Y H:i') }}.</p>
@if (count($matches))
    @foreach ($matches as $match)
        @php
            $status = $match['lastStatus'] ?? null;
            $hasScore = isset($match['lastHomeScore'], $match['lastAwayScore']);
            $label = $status === 'finished' ? 'Finalizado' : ($hasScore ? 'En seguimiento' : 'Pendiente');
            $color = $status === 'finished' ? '#166534' : '#92400e';
        @endphp
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0">
            <h2 style="font-size:17px;margin:0 0 8px">
                {{ $match['homeTeam'] ?? 'Local' }} vs {{ $match['awayTeam'] ?? 'Visitante' }}
            </h2>
            <p style="margin:5px 0"><strong>Pronóstico:</strong> {{ $match['prediction'] ?? 'Sin pronóstico' }}</p>
            @if (!empty($match['confidence']))
                <p style="margin:5px 0"><strong>Confianza:</strong> {{ $match['confidence'] }}%</p>
            @endif
            <p style="margin:5px 0"><strong>Marcador:</strong>
                {{ $hasScore ? "{$match['lastHomeScore']}-{$match['lastAwayScore']}" : 'Pendiente' }}
            </p>
            <p style="margin:8px 0 0;color:{{ $color }}"><strong>{{ $label }}</strong></p>
        </div>
    @endforeach
@else
    <p>No hay partidos con pronóstico guardados en seguimiento.</p>
@endif
<p style="margin-top:24px;color:#6b7280;font-size:12px">
    Este correo contiene únicamente partidos guardados en la base de datos del panel.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
