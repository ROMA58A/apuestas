<?php

namespace App\Console\Commands;

use App\Services\FootballResultsAggregator;
use Illuminate\Console\Command;
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
            $matches = app(FootballResultsAggregator::class)->live();
        } catch (\Throwable $exception) {
            $this->error("No se pudieron consultar los resultados: {$exception->getMessage()}");

            return self::FAILURE;
        }

        $body = "Resultados de fútbol\n";
        $body .= 'Enviado: '.now()->format('Y-m-d H:i:s')."\n\n";
        $body .= collect($matches)->map(function (array $match): string {
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

        $body .= "\n\nFuentes consultadas: SportAPI, SportScore y Soccer Data.";
        $body .= "\nFuente: Powered by SportScore — https://sportscore.com/";

        try {
            Mail::raw($body, function ($message) use ($recipient): void {
                $message->to($recipient)
                    ->subject('Resultados de fútbol');
            });
        } catch (\Throwable $exception) {
            $this->error("No se pudo enviar el correo: {$exception->getMessage()}");

            return self::FAILURE;
        }

        $this->info("Correo enviado correctamente a {$recipient} con el asunto \"Resultados de fútbol\".");

        return self::SUCCESS;
    }
}
