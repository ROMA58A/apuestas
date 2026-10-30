<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MatchManagerTest extends TestCase
{
    public function test_dashboard_loads_watchlist_and_database_results(): void
    {
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/api/matches/watch')) {
                return Http::response([
                    'matches' => [[
                        'id' => 3,
                        'homeTeam' => 'América',
                        'awayTeam' => 'Cruz Azul',
                        'competition' => 'Liga MX',
                    ]],
                ]);
            }

            return Http::response(['matches' => []]);
        });

        $this->get('/')
            ->assertOk()
            ->assertSee('Agregar a seguimiento')
            ->assertSee('Guardar resultado')
            ->assertSee('América')
            ->assertSee('Cruz Azul');
    }

    public function test_watch_form_sends_validated_match_to_the_bot_api(): void
    {
        Http::fake([
            '*/api/matches/watch' => Http::response(['matches' => []], 201),
            '*/api/matches*' => Http::response(['matches' => []]),
        ]);

        $this->post('/partidos/seguimiento', [
            'homeTeam' => ' América ',
            'awayTeam' => 'Cruz Azul',
            'competition' => 'Liga MX',
        ])->assertRedirect('/');

        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/matches/watch')
            && $request->method() === 'POST'
            && $request->data()['matches'][0]['homeTeam'] === 'América'
            && $request->data()['matches'][0]['awayTeam'] === 'Cruz Azul'
        );
    }

    public function test_result_form_saves_match_in_database_through_the_api(): void
    {
        Http::fake([
            '*/api/matches' => Http::response(['matches' => []], 201),
        ]);

        $this->post('/partidos/resultados', [
            'homeTeam' => 'América',
            'awayTeam' => 'Cruz Azul',
            'homeScore' => 2,
            'awayScore' => 1,
            'competition' => 'Liga MX',
            'playedAt' => '2026-10-29',
        ])->assertRedirect('/');

        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/matches')
            && $request->method() === 'POST'
            && $request->data()['homeScore'] === 2
            && $request->data()['awayScore'] === 1
            && $request->data()['playedAt'] === '2026-10-29'
        );
    }

    public function test_followed_match_can_be_removed(): void
    {
        Http::fake([
            '*/api/matches/watch/507f1f77bcf86cd799439011' => Http::response(['removed' => true]),
        ]);

        $this->delete('/partidos/seguimiento/507f1f77bcf86cd799439011')->assertRedirect('/');

        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/matches/watch/507f1f77bcf86cd799439011')
            && $request->method() === 'DELETE'
        );
    }

    public function test_invalid_result_is_rejected_without_calling_the_api(): void
    {
        Http::fake();

        $this->from('/')->post('/partidos/resultados', [
            'homeTeam' => 'América',
            'awayTeam' => 'Cruz Azul',
            'homeScore' => -1,
            'awayScore' => 1,
            'playedAt' => '2026-10-29',
        ])->assertRedirect('/')
            ->assertSessionHasErrors('homeScore');

        Http::assertNothingSent();
    }

    public function test_pasted_pronostico_table_is_saved_to_the_follow_list(): void
    {
        Http::fake([
            '*/api/matches/watch' => Http::response([
                'matches' => [
                    ['id' => 1, 'homeTeam' => 'Le Havre', 'awayTeam' => 'PSG', 'competition' => 'Ligue 1'],
                    ['id' => 2, 'homeTeam' => 'Elversberg', 'awayTeam' => 'Mainz', 'competition' => 'Bundesliga'],
                ],
            ], 201),
        ]);

        $this->post('/partidos/importar', [
            'pasted_text' => "VIERNES 30 OCT\nHora\tLiga\tPartido\tPronóstico\t%\n12:00 PM\tLigue 1\tLe Havre vs PSG\tPSG gana\t80%\n1:30 PM\tBundesliga\tElversberg vs Mainz\tMás de 0.5 goles\t--",
        ])->assertRedirect('/')
            ->assertSessionHas('status', '2 partidos importados a seguimiento.');

        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/matches/watch')
            && $request->method() === 'POST'
            && count($request->data()['matches']) === 2
            && $request->data()['matches'][0]['competition'] === 'Ligue 1'
            && $request->data()['matches'][0]['prediction'] === 'PSG gana'
            && $request->data()['matches'][0]['confidence'] === 80.0
            && $request->data()['matches'][0]['kickoffAt'] === date('Y').'-10-30T12:00:00'
        );
    }

    public function test_uploaded_text_file_is_saved_to_the_follow_list(): void
    {
        Http::fake([
            '*/api/matches/watch' => Http::response([
                'matches' => [
                    ['id' => 1, 'homeTeam' => 'Le Havre', 'awayTeam' => 'PSG', 'competition' => 'Ligue 1'],
                ],
            ], 201),
        ]);

        $file = UploadedFile::fake()->createWithContent(
            'pronosticos.txt',
            "VIERNES 30 OCT\nHora\tLiga\tPartido\tPronóstico\t%\n12:00 PM\tLigue 1\tLe Havre vs PSG\tPSG gana\t80%"
        );

        $this->post('/partidos/importar', ['file' => $file])
            ->assertRedirect('/')
            ->assertSessionHas('status', '1 partido importado a seguimiento.');

        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/api/matches/watch')
            && $request->method() === 'POST'
            && $request->data()['matches'][0]['homeTeam'] === 'Le Havre'
            && $request->data()['matches'][0]['prediction'] === 'PSG gana'
        );
    }
}
