<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class SendLiveResultsEmail extends Command
{
    protected $signature = 'results:email';

    protected $description = 'Envía por correo los resultados actuales de fútbol';

    public function handle(): int
    {
        $recipient = (string) config('services.results.email');
        $apiUrl = rtrim((string) config('services.match_api.url'), '/');

        if ($recipient === '' || $apiUrl === '') {
            $this->error('Configura RESULTS_EMAIL y MATCH_API_URL en el archivo .env.');

            return self::FAILURE;
        }

        try {
            $matches = Http::acceptJson()
                ->withToken((string) config('services.match_api.token'))
                ->timeout(15)
                ->get("{$apiUrl}/api/matches/live", [
                    'sport' => 'football',
                    'limit' => 10,
                ])
                ->throw()
                ->json('matches', []);
        } catch (\Throwable $exception) {
            $this->error("No se pudieron consultar los resultados: {$exception->getMessage()}");

            return self::FAILURE;
        }

        $body = collect($matches)->map(function (array $match): string {
            $home = $match['home'] ?? 'Local';
            $away = $match['away'] ?? 'Visitante';
            $homeScore = $match['home_score'] ?? '-';
            $awayScore = $match['away_score'] ?? '-';
            $status = $match['status_text'] ?? ($match['status'] ?? 'Estado no disponible');

            return "{$home} {$homeScore}-{$awayScore} {$away}\n{$status}";
        })->join("\n\n");

        if ($body === '') {
            $body = 'No hay partidos en vivo o recientes en este momento.';
        }

        $body .= "\n\nFuente: Powered by SportScore — https://sportscore.com/";

        try {
            Mail::raw($body, function ($message) use ($recipient): void {
                $message->to($recipient)
                    ->subject('Resultados de fútbol');
            });
        } catch (\Throwable $exception) {
            $this->error("No se pudo enviar el correo: {$exception->getMessage()}");

            return self::FAILURE;
        }

        $this->info("Resultados enviados a {$recipient}.");

        return self::SUCCESS;
    }
}
