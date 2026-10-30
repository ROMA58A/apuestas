<?php

namespace App\Http\Controllers;

use App\Services\MatchDocumentImporter;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class MatchManagerController extends Controller
{
    public function index(): View
    {
        $watchlist = [];
        $results = [];
        $apiError = null;

        try {
            $watchlist = $this->api()->get('/api/matches/watch')->throw()->json('matches', []);
            $results = $this->api()->get('/api/matches?limit=50')->throw()->json('matches', []);
        } catch (ConnectionException) {
            $apiError = 'No se pudo conectar con la API. Inicia el bot y confirma que la API esté disponible.';
        } catch (RequestException $exception) {
            $apiError = $this->apiError($exception);
        }

        return view('matches.index', compact('watchlist', 'results', 'apiError'));
    }

    public function storeWatch(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'homeTeam' => ['required', 'string', 'max:120'],
            'awayTeam' => ['required', 'string', 'max:120'],
            'competition' => ['nullable', 'string', 'max:160'],
            'prediction' => ['nullable', 'string', 'max:120'],
            'confidence' => ['nullable', 'numeric', 'between:0,100'],
            'kickoffAt' => [
                'nullable',
                'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/',
            ],
        ]);

        try {
            $this->api()
                ->post('/api/matches/watch', ['matches' => [$data]])
                ->throw();
        } catch (ConnectionException) {
            return back()->withErrors([
                'api' => 'No se pudo conectar con la API. Inicia el bot y vuelve a intentarlo.',
            ])->withInput();
        } catch (RequestException $exception) {
            return back()->withErrors(['api' => $this->apiError($exception)])->withInput();
        }

        return to_route('matches.index')->with('status', 'Partido agregado a seguimiento.');
    }

    public function destroyWatch(string $id): RedirectResponse
    {
        try {
            $this->api()->delete("/api/matches/watch/{$id}")->throw();
        } catch (ConnectionException) {
            return back()->withErrors([
                'api' => 'No se pudo conectar con la API. Inicia el bot y vuelve a intentarlo.',
            ]);
        } catch (RequestException $exception) {
            return back()->withErrors(['api' => $this->apiError($exception)]);
        }

        return to_route('matches.index')->with('status', 'Partido eliminado del seguimiento.');
    }

    public function storeResult(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'homeTeam' => ['required', 'string', 'max:120'],
            'awayTeam' => ['required', 'string', 'max:120'],
            'homeScore' => ['required', 'integer', 'min:0', 'max:65535'],
            'awayScore' => ['required', 'integer', 'min:0', 'max:65535'],
            'competition' => ['nullable', 'string', 'max:160'],
            'playedAt' => ['required', 'date_format:Y-m-d'],
        ]);

        try {
            $this->api()->post('/api/matches', $data)->throw();
        } catch (ConnectionException) {
            return back()->withErrors([
                'api' => 'No se pudo conectar con la API. Inicia el bot y vuelve a intentarlo.',
            ])->withInput();
        } catch (RequestException $exception) {
            return back()->withErrors(['api' => $this->apiError($exception)])->withInput();
        }

        return to_route('matches.index')->with('status', 'Resultado guardado en la base de datos.');
    }

    public function import(Request $request, MatchDocumentImporter $importer): RedirectResponse
    {
        $data = $request->validate([
            'file' => ['nullable', 'file', 'mimes:pdf,txt,docx', 'max:2048'],
            'pasted_text' => ['nullable', 'string', 'max:500000'],
        ]);

        if (empty($data['file']) && empty($data['pasted_text'])) {
            throw ValidationException::withMessages([
                'import' => 'Selecciona un archivo o pega el texto de los partidos.',
            ]);
        }

        if (! empty($data['file']) && ! empty($data['pasted_text'])) {
            throw ValidationException::withMessages([
                'import' => 'Usa un archivo o pega texto, no ambos a la vez.',
            ]);
        }

        try {
            $matches = isset($data['file'])
                ? $importer->fromUpload($data['file'])
                : $importer->parse($data['pasted_text']);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (\Throwable $exception) {
            report($exception);
            throw ValidationException::withMessages([
                'import' => 'No se pudo leer el archivo. Comprueba que sea un PDF con texto seleccionable, TXT o DOCX válido.',
            ]);
        }

        try {
            $response = $this->api()->post('/api/matches/watch', ['matches' => $matches])->throw();
        } catch (ConnectionException) {
            return back()->withErrors([
                'api' => 'No se pudo conectar con la API. Inicia el bot y vuelve a intentarlo.',
            ]);
        } catch (RequestException $exception) {
            return back()->withErrors(['api' => $this->apiError($exception)])->withInput();
        }

        $saved = count($response->json('matches', []));
        $label = $saved === 1 ? 'partido importado' : 'partidos importados';

        return to_route('matches.index')->with('status', "{$saved} {$label} a seguimiento.");
    }

    private function api(): PendingRequest
    {
        $request = Http::acceptJson()
            ->baseUrl(rtrim(config('services.match_api.url'), '/'))
            ->timeout(10);
        $token = config('services.match_api.token');

        return $token ? $request->withToken($token) : $request;
    }

    private function apiError(RequestException $exception): string
    {
        $message = $exception->response->json('error');

        return is_string($message) && $message !== ''
            ? $message
            : 'La API de partidos devolvió un error. Revisa su configuración y vuelve a intentarlo.';
    }
}
