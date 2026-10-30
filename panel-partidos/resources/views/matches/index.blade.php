<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Panel de partidos</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <nav class="topbar navbar navbar-dark">
        <div class="container page-shell py-2">
            <a class="navbar-brand d-flex align-items-center gap-3 fw-semibold" href="{{ route('matches.index') }}">
                <span class="brand-mark" aria-hidden="true">⚽</span>
                <span>Panel de partidos</span>
            </a>
            <span class="navbar-text small text-white-50 d-none d-sm-inline">Seguimiento y resultados</span>
        </div>
    </nav>

    <main class="container page-shell py-4 py-lg-5">
        <header class="mb-4 mb-lg-5">
            <div class="text-uppercase small fw-semibold text-primary mb-2">Centro de control</div>
            <h1 class="page-title fw-bold mb-2">Administra tus partidos</h1>
            <p class="text-secondary mb-0">Importa pronósticos, recibe el seguimiento por WhatsApp y consulta cómo va cada apuesta.</p>
        </header>

        @if (session('status'))
            <div class="alert alert-success alert-dismissible fade show" role="status">
                {{ session('status') }}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
            </div>
        @endif

        @if ($apiError)
            <div class="alert alert-warning" role="alert">
                <strong>No se pudo cargar la información.</strong> {{ $apiError }}
            </div>
        @endif

        @error('api')
            <div class="alert alert-danger" role="alert">{{ $message }}</div>
        @enderror

        @error('import')
            <div class="alert alert-danger" role="alert">{{ $message }}</div>
        @enderror

        @error('file')
            <div class="alert alert-danger" role="alert">{{ $message }}</div>
        @enderror

        <section class="panel-card card mb-4 mb-lg-5">
            <div class="card-body p-4 p-xl-5">
                <div class="d-flex align-items-center gap-3 mb-3">
                    <span class="section-icon" aria-hidden="true">⇧</span>
                    <div>
                        <h2 class="h5 fw-bold mb-1">Importar partidos</h2>
                        <p class="small text-secondary mb-0">Sube tu pronóstico o pega la tabla. Los partidos se guardan directamente en seguimiento.</p>
                    </div>
                </div>
                <ul class="nav nav-pills gap-2 mb-4" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="upload-tab" data-bs-toggle="pill" data-bs-target="#upload-pane" type="button" role="tab" aria-controls="upload-pane" aria-selected="true">Subir archivo</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="paste-tab" data-bs-toggle="pill" data-bs-target="#paste-pane" type="button" role="tab" aria-controls="paste-pane" aria-selected="false">Pegar texto</button>
                    </li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane fade show active" id="upload-pane" role="tabpanel" aria-labelledby="upload-tab" tabindex="0">
                        <form method="POST" action="{{ route('matches.import') }}" enctype="multipart/form-data">
                            @csrf
                            <label for="match-file" class="form-label fw-medium">Archivo de pronósticos</label>
                            <input id="match-file" name="file" type="file" class="form-control @error('file') is-invalid @enderror"
                                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
                            <div class="form-text mb-3">PDF con texto seleccionable, TXT o DOCX. Máximo 2 MB. También acepta documentos como el de ejemplo.</div>
                            @error('file') <div class="invalid-feedback d-block mb-3">{{ $message }}</div> @enderror
                            <button type="submit" class="btn btn-primary px-4 py-2 fw-semibold">Importar y guardar</button>
                        </form>
                    </div>
                    <div class="tab-pane fade" id="paste-pane" role="tabpanel" aria-labelledby="paste-tab" tabindex="0">
                        <form method="POST" action="{{ route('matches.import') }}">
                            @csrf
                            <label for="pasted-text" class="form-label fw-medium">Texto de los partidos</label>
                            <textarea id="pasted-text" name="pasted_text" rows="7" maxlength="500000"
                                class="form-control font-monospace @error('pasted_text') is-invalid @enderror"
                                placeholder="Pega la tabla completa, por ejemplo:&#10;Hora | Liga | Partido | Pronóstico | %&#10;12:00 PM | Ligue 1 | Le Havre vs PSG | PSG gana | 80%">{{ old('pasted_text') }}</textarea>
                            @error('pasted_text') <div class="invalid-feedback">{{ $message }}</div> @enderror
                            <div class="form-text mb-3">Se guardan fecha, hora, liga, pronóstico y porcentaje. Un pronóstico no se trata como resultado final.</div>
                            <button type="submit" class="btn btn-primary px-4 py-2 fw-semibold">Importar y guardar</button>
                        </form>
                    </div>
                </div>
            </div>
        </section>

        <div class="row g-4 mb-4 mb-lg-5">
            <div class="col-12 col-lg-6">
                <section class="panel-card card h-100">
                    <div class="card-body p-4 p-xl-5">
                        <div class="d-flex align-items-center gap-3 mb-4">
                            <span class="section-icon" aria-hidden="true">◎</span>
                            <div>
                                <h2 class="h5 fw-bold mb-1">Agregar a seguimiento</h2>
                                <p class="small text-secondary mb-0">El bot avisa del inicio, descanso, goles y resultado final.</p>
                            </div>
                        </div>
                        <form method="POST" action="{{ route('matches.watch.store') }}">
                            @csrf
                            <div class="mb-3">
                                <label for="watch-home-team" class="form-label fw-medium">Equipo local</label>
                                <input id="watch-home-team" name="homeTeam" class="form-control @error('homeTeam') is-invalid @enderror"
                                    value="{{ old('homeTeam') }}" maxlength="120" required autocomplete="off" placeholder="Ej. América">
                                @error('homeTeam') <div class="invalid-feedback">{{ $message }}</div> @enderror
                            </div>
                            <div class="mb-3">
                                <label for="watch-away-team" class="form-label fw-medium">Equipo visitante</label>
                                <input id="watch-away-team" name="awayTeam" class="form-control @error('awayTeam') is-invalid @enderror"
                                    value="{{ old('awayTeam') }}" maxlength="120" required autocomplete="off" placeholder="Ej. Cruz Azul">
                                @error('awayTeam') <div class="invalid-feedback">{{ $message }}</div> @enderror
                            </div>
                            <div class="mb-4">
                                <label for="watch-competition" class="form-label fw-medium">Competencia <span class="text-secondary fw-normal">(opcional)</span></label>
                                <input id="watch-competition" name="competition" class="form-control @error('competition') is-invalid @enderror"
                                    value="{{ old('competition') }}" maxlength="160" autocomplete="off" placeholder="Ej. Liga MX">
                                @error('competition') <div class="invalid-feedback">{{ $message }}</div> @enderror
                            </div>
                            <div class="mb-3">
                                <label for="watch-prediction" class="form-label fw-medium">Pronóstico <span class="text-secondary fw-normal">(opcional)</span></label>
                                <input id="watch-prediction" name="prediction" class="form-control @error('prediction') is-invalid @enderror"
                                    value="{{ old('prediction') }}" maxlength="120" placeholder="Ej. PSG gana o Más de 0.5 goles">
                                @error('prediction') <div class="invalid-feedback">{{ $message }}</div> @enderror
                            </div>
                            <div class="row g-3 mb-4">
                                <div class="col-12 col-sm-6">
                                    <label for="watch-kickoff" class="form-label fw-medium">Fecha y hora <span class="text-secondary fw-normal">(opcional)</span></label>
                                    <input id="watch-kickoff" name="kickoffAt" type="datetime-local" class="form-control @error('kickoffAt') is-invalid @enderror"
                                        value="{{ old('kickoffAt') }}">
                                    @error('kickoffAt') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                                <div class="col-12 col-sm-6">
                                    <label for="watch-confidence" class="form-label fw-medium">Porcentaje <span class="text-secondary fw-normal">(opcional)</span></label>
                                    <input id="watch-confidence" name="confidence" type="number" min="0" max="100" step="0.1" class="form-control @error('confidence') is-invalid @enderror"
                                        value="{{ old('confidence') }}" placeholder="Ej. 80">
                                    @error('confidence') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold">Agregar partido</button>
                        </form>
                    </div>
                </section>
            </div>

            <div class="col-12 col-lg-6">
                <section class="panel-card card h-100">
                    <div class="card-body p-4 p-xl-5">
                        <div class="d-flex align-items-center gap-3 mb-4">
                            <span class="section-icon" aria-hidden="true">▤</span>
                            <div>
                                <h2 class="h5 fw-bold mb-1">Guardar resultado</h2>
                                <p class="small text-secondary mb-0">Registra un resultado final en la base de datos.</p>
                            </div>
                        </div>
                        <form method="POST" action="{{ route('matches.results.store') }}">
                            @csrf
                            <div class="row g-3">
                                <div class="col-12 col-sm-6">
                                    <label for="result-home-team" class="form-label fw-medium">Equipo local</label>
                                    <input id="result-home-team" name="homeTeam" class="form-control @error('homeTeam') is-invalid @enderror"
                                        value="{{ old('homeTeam') }}" maxlength="120" required autocomplete="off" placeholder="Ej. América">
                                    @error('homeTeam') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                                <div class="col-12 col-sm-6">
                                    <label for="result-away-team" class="form-label fw-medium">Equipo visitante</label>
                                    <input id="result-away-team" name="awayTeam" class="form-control @error('awayTeam') is-invalid @enderror"
                                        value="{{ old('awayTeam') }}" maxlength="120" required autocomplete="off" placeholder="Ej. Cruz Azul">
                                    @error('awayTeam') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                                <div class="col-6">
                                    <label for="home-score" class="form-label fw-medium">Goles local</label>
                                    <input id="home-score" name="homeScore" type="number" min="0" max="65535"
                                        class="form-control @error('homeScore') is-invalid @enderror" value="{{ old('homeScore', 0) }}" required>
                                    @error('homeScore') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                                <div class="col-6">
                                    <label for="away-score" class="form-label fw-medium">Goles visitante</label>
                                    <input id="away-score" name="awayScore" type="number" min="0" max="65535"
                                        class="form-control @error('awayScore') is-invalid @enderror" value="{{ old('awayScore', 0) }}" required>
                                    @error('awayScore') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                                <div class="col-12 col-sm-6">
                                    <label for="result-competition" class="form-label fw-medium">Competencia <span class="text-secondary fw-normal">(opcional)</span></label>
                                    <input id="result-competition" name="competition" class="form-control @error('competition') is-invalid @enderror"
                                        value="{{ old('competition') }}" maxlength="160" autocomplete="off" placeholder="Ej. Liga MX">
                                    @error('competition') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                                <div class="col-12 col-sm-6">
                                    <label for="played-at" class="form-label fw-medium">Fecha</label>
                                    <input id="played-at" name="playedAt" type="date"
                                        class="form-control @error('playedAt') is-invalid @enderror"
                                        value="{{ old('playedAt', now()->format('Y-m-d')) }}" required>
                                    @error('playedAt') <div class="invalid-feedback">{{ $message }}</div> @enderror
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold mt-4">Guardar en la base de datos</button>
                        </form>
                    </div>
                </section>
            </div>
        </div>

        <section class="panel-card card mb-4">
            <div class="card-body p-4">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <div>
                        <h2 class="h5 fw-bold mb-1">Partidos en seguimiento</h2>
                        <p class="small text-secondary mb-0">Los nombres deben coincidir con los publicados por SportScore.</p>
                    </div>
                    <span class="badge rounded-pill text-bg-light">{{ count($watchlist) }} partidos</span>
                </div>
                @if (count($watchlist))
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead><tr><th>Partido</th><th>Pronóstico / liga</th><th>Estado</th><th class="text-end">Acción</th></tr></thead>
                            <tbody>
                                @foreach ($watchlist as $match)
                                    <tr>
                                        <td class="fw-semibold">{{ $match['homeTeam'] }} <span class="text-secondary fw-normal">vs</span> {{ $match['awayTeam'] }}</td>
                                        <td class="text-secondary">
                                            {{ ($match['prediction'] ?? '') ?: 'Sin pronóstico' }}
                                            @if (!empty($match['confidence']))<span class="d-block small">{{ $match['confidence'] }}%</span>@endif
                                            <span class="d-block small">{{ $match['competition'] ?? '—' }}</span>
                                            @if (!empty($match['kickoffAt']))
                                                <span class="d-block small">{{ str_replace('T', ' ', $match['kickoffAt']) }}</span>
                                            @endif
                                        </td>
                                        <td class="text-secondary">
                                            @if (($match['lastStatus'] ?? null) === 'finished')
                                                Final: {{ $match['lastHomeScore'] }}-{{ $match['lastAwayScore'] }}
                                            @elseif (isset($match['lastHomeScore'], $match['lastAwayScore']))
                                                {{ $match['lastHomeScore'] }}-{{ $match['lastAwayScore'] }}
                                            @else
                                                Pendiente
                                            @endif
                                        </td>
                                        <td class="text-end">
                                            <form method="POST" action="{{ route('matches.watch.destroy', $match['id']) }}">
                                                @csrf
                                                @method('DELETE')
                                                <button type="submit" class="btn btn-sm btn-outline-danger">Quitar</button>
                                            </form>
                                        </td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @else
                    <div class="empty-state text-center p-4">Aún no hay partidos. Agrega uno desde el formulario de seguimiento.</div>
                @endif
            </div>
        </section>

        <section class="panel-card card">
            <div class="card-body p-4">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <div>
                        <h2 class="h5 fw-bold mb-1">Resultados guardados</h2>
                        <p class="small text-secondary mb-0">Últimos partidos registrados en la base de datos.</p>
                    </div>
                    <span class="badge rounded-pill text-bg-light">{{ count($results) }} resultados</span>
                </div>
                @if (count($results))
                    <div class="table-responsive">
                        <table class="table align-middle mb-0">
                            <thead><tr><th>Partido</th><th>Marcador</th><th>Competencia</th><th>Fecha</th></tr></thead>
                            <tbody>
                                @foreach ($results as $match)
                                    <tr>
                                        <td class="fw-semibold">{{ $match['homeTeam'] }} <span class="text-secondary fw-normal">vs</span> {{ $match['awayTeam'] }}</td>
                                        <td class="score">{{ $match['homeScore'] }} - {{ $match['awayScore'] }}</td>
                                        <td class="text-secondary">{{ $match['competition'] ?: '—' }}</td>
                                        <td class="text-secondary text-nowrap">{{ \Illuminate\Support\Carbon::parse($match['playedAt'])->format('d/m/Y') }}</td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @else
                    <div class="empty-state text-center p-4">Todavía no se han guardado resultados.</div>
                @endif
            </div>
        </section>
        <footer class="text-center small text-secondary py-4">Panel local conectado a la API de partidos del bot.</footer>
    </main>
</body>
</html>
