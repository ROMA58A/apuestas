<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

class FootballResultsAggregator
{
    public function live(): array
    {
        $matches = [];

        foreach ([
            'SportAPI' => fn () => $this->sportApi(),
            'SportScore' => fn () => $this->sportScore(),
            'Soccer Data' => fn () => $this->soccerData(),
        ] as $loader) {
            try {
                $matches = array_merge($matches, $loader());
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return $this->deduplicate($matches);
    }

    private function sportApi(): array
    {
        $key = (string) config('services.sportapi.key');
        if ($key === '') {
            return [];
        }

        $date = now('UTC')->toDateString();
        $payload = $this->request('https://sportapi.ai/api')
            ->withHeaders(['X-Api-Key' => $key])
            ->get("/fixtures/date/{$date}")
            ->throw()
            ->json();

        return collect($payload['data'] ?? [])
            ->map(fn (array $match): array => $this->normalize(
                $match['home_team'] ?? 'Local',
                $match['away_team'] ?? 'Visitante',
                $match['home_score'] ?? null,
                $match['away_score'] ?? null,
                $match['status'] ?? 'Estado no disponible',
                $match['league_name'] ?? null,
                'SportAPI'
            ))
            ->all();
    }

    private function sportScore(): array
    {
        $payload = $this->request('https://sportscore.com')
            ->get('/api/widget/matches/', ['sport' => 'football', 'limit' => 50])
            ->throw()
            ->json();

        return collect($payload['matches'] ?? [])
            ->map(fn (array $match): array => $this->normalize(
                $match['home'] ?? 'Local',
                $match['away'] ?? 'Visitante',
                $match['home_score'] ?? null,
                $match['away_score'] ?? null,
                $match['status_text'] ?? ($match['status'] ?? 'Estado no disponible'),
                $match['competition'] ?? null,
                'SportScore'
            ))
            ->all();
    }

    private function soccerData(): array
    {
        $key = (string) config('services.soccer_data.key');
        if ($key === '') {
            return [];
        }

        $payload = $this->request('https://api.soccer-data.co/v1')
            ->withHeaders(['X-Api-Key' => $key])
            ->get('/matches', ['status' => 'live', 'per_page' => 100])
            ->throw()
            ->json();

        return collect($payload['data'] ?? $payload['matches'] ?? [])
            ->map(fn (array $match): array => $this->normalize(
                data_get($match, 'home_team.name', $match['home'] ?? 'Local'),
                data_get($match, 'away_team.name', $match['away'] ?? 'Visitante'),
                data_get($match, 'score.home', $match['home_score'] ?? null),
                data_get($match, 'score.away', $match['away_score'] ?? null),
                $match['status'] ?? 'Estado no disponible',
                data_get($match, 'competition.name'),
                'Soccer Data'
            ))
            ->all();
    }

    private function request(string $baseUrl): PendingRequest
    {
        return Http::acceptJson()->baseUrl($baseUrl)->timeout(15);
    }

    private function normalize(
        string $home,
        string $away,
        mixed $homeScore,
        mixed $awayScore,
        string $status,
        ?string $competition,
        string $source
    ): array {
        return [
            'home' => $home,
            'away' => $away,
            'home_score' => $homeScore,
            'away_score' => $awayScore,
            'status_text' => $status,
            'competition' => $competition,
            'source' => $source,
        ];
    }

    private function deduplicate(array $matches): array
    {
        $unique = [];
        foreach ($matches as $match) {
            $key = mb_strtolower(trim($match['home']).'|'.trim($match['away']));
            $unique[$key] ??= $match;
        }

        return array_values($unique);
    }
}
