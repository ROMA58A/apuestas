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

        if ($recipient === '') {
            $this->error('Configura RESULTS_EMAIL en el archivo .env.');

            return self::FAILURE;
        }
        if (filter_var($recipient, FILTER_VALIDATE_EMAIL) === false) {
            $this->error("RESULTS_EMAIL no es válido: {$recipient}");

            return self::FAILURE;
        }

        try {
            $apiUrl = rtrim((string) config('services.match_api.url'), '/');
            $matches = Http::acceptJson()
                ->withToken((string) config('services.match_api.token'))
                ->timeout(15)
                ->get("{$apiUrl}/api/matches/watch")
                ->throw()
                ->json('matches', []);
            $matches = collect($matches)
                ->filter(fn (array $match): bool => trim((string) ($match['prediction'] ?? '')) !== '')
                ->values()
                ->all();
        } catch (\Throwable $exception) {
            $this->error("No se pudieron consultar los partidos guardados: {$exception->getMessage()}");

            return self::FAILURE;
        }

        try {
            Mail::send('emails.results', [
                'matches' => $matches,
                'sentAt' => now(),
            ], function ($message) use ($recipient): void {
                $message->to($recipient)
                    ->subject('Resultados de tus partidos');
            });
        } catch (\Throwable $exception) {
            $this->error("No se pudo enviar el correo: {$exception->getMessage()}");

            return self::FAILURE;
        }

        $this->info("Correo enviado correctamente a {$recipient} con el asunto \"Resultados de fútbol\".");

        return self::SUCCESS;
    }
}
