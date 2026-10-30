<?php

use App\Http\Controllers\MatchManagerController;
use Illuminate\Support\Facades\Route;

Route::get('/', [MatchManagerController::class, 'index'])->name('matches.index');
Route::post('/partidos/seguimiento', [MatchManagerController::class, 'storeWatch'])
    ->name('matches.watch.store');
Route::delete('/partidos/seguimiento/{id}', [MatchManagerController::class, 'destroyWatch'])
    ->where('id', '[a-fA-F0-9]{24}')
    ->name('matches.watch.destroy');
Route::post('/partidos/resultados', [MatchManagerController::class, 'storeResult'])
    ->name('matches.results.store');
Route::post('/partidos/importar', [MatchManagerController::class, 'import'])
    ->name('matches.import');
