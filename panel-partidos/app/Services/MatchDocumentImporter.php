<?php

namespace App\Services;

use DOMDocument;
use DOMXPath;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Smalot\PdfParser\Parser as PdfParser;
use ZipArchive;

class MatchDocumentImporter
{
    private const MAX_IMPORT_MATCHES = 100;

    public function fromUpload(UploadedFile $file): array
    {
        $text = match (strtolower($file->getClientOriginalExtension())) {
            'txt' => file_get_contents($file->getRealPath()),
            'pdf' => (new PdfParser)->parseFile($file->getRealPath())->getText(),
            'docx' => $this->docxText($file->getRealPath()),
            default => throw ValidationException::withMessages([
                'file' => 'El archivo debe ser PDF, TXT o DOCX.',
            ]),
        };

        if (! is_string($text) || trim($text) === '') {
            throw ValidationException::withMessages([
                'file' => 'No se encontró texto legible en el archivo.',
            ]);
        }

        return $this->parse($text);
    }

    public function parse(string $text): array
    {
        $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8, Windows-1252, ISO-8859-1');
        $lines = preg_split('/\R/u', str_replace(["\u{00A0}", "\u{FEFF}"], ' ', $text)) ?: [];
        $matches = [];
        $sequentialTable = false;
        $skipHeaders = false;
        $pendingCells = [];
        $currentDate = null;

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            if (preg_match('/^(?:hora|time)$/iu', $line)) {
                $sequentialTable = true;
                $skipHeaders = true;
                $pendingCells = [];

                continue;
            }

            if ($skipHeaders && preg_match('/^(?:liga|league|partido|match|pron[oó]stico|prediction|%|porcentaje)$/iu', $line)) {
                if (preg_match('/^(?:%|porcentaje)$/iu', $line)) {
                    $skipHeaders = false;
                }

                continue;
            }

            if ($date = $this->dateFromHeading($line)) {
                $currentDate = $date;
                $pendingCells = [];

                continue;
            }
            if (preg_match('/^(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/iu', $line)) {
                $pendingCells = [];

                continue;
            }

            if ($skipHeaders) {
                $skipHeaders = false;
            }

            $cells = preg_split('/\t+|\s*\|\s*/u', $line) ?: [];
            if (count($cells) === 1 && preg_match('/\s{2,}/u', $line)) {
                $cells = preg_split('/\s{2,}/u', $line) ?: [];
            }

            if (count($cells) > 1 && ($match = $this->fromCells($cells, $currentDate))) {
                $this->addMatch($matches, $match);

                continue;
            }

            if ($sequentialTable && ! $this->isTableHeading($line)) {
                $pendingCells[] = $line;
                if (count($pendingCells) === 5) {
                    if ($match = $this->fromCells($pendingCells, $currentDate)) {
                        $this->addMatch($matches, $match);
                    }
                    $pendingCells = [];
                }

                continue;
            }

            if ($match = $this->fromFreeTextLine($line, $currentDate)) {
                $this->addMatch($matches, $match);
            }
        }

        if ($matches === []) {
            throw ValidationException::withMessages([
                'import' => 'No encontré partidos. Usa filas con equipos separados por “vs”, por ejemplo: Liga MX | América vs Cruz Azul.',
            ]);
        }

        if (count($matches) > self::MAX_IMPORT_MATCHES) {
            throw ValidationException::withMessages([
                'import' => 'El archivo contiene más de 100 partidos. Divide la lista en varios archivos.',
            ]);
        }

        return array_values($matches);
    }

    private function docxText(string $path): string
    {
        $archive = new ZipArchive;
        if ($archive->open($path) !== true) {
            throw ValidationException::withMessages([
                'file' => 'No se pudo abrir el documento DOCX.',
            ]);
        }

        try {
            $documentXml = $archive->getFromName('word/document.xml');
            $entry = $archive->statName('word/document.xml');
            if (! is_string($documentXml) || ! $entry || $entry['size'] > 5_000_000) {
                throw ValidationException::withMessages([
                    'file' => 'El documento DOCX no contiene texto válido o es demasiado grande.',
                ]);
            }
        } finally {
            $archive->close();
        }

        $document = new DOMDocument;
        if (! $document->loadXML($documentXml, LIBXML_NONET | LIBXML_NOBLANKS)) {
            throw ValidationException::withMessages([
                'file' => 'No se pudo leer el contenido del documento DOCX.',
            ]);
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        $body = $xpath->query('/w:document/w:body')->item(0);
        if (! $body) {
            throw ValidationException::withMessages([
                'file' => 'El documento DOCX no tiene contenido legible.',
            ]);
        }

        $lines = [];
        foreach ($body->childNodes as $node) {
            if ($node->localName === 'p') {
                $lines[] = $this->wordText($xpath, $node);

                continue;
            }

            if ($node->localName !== 'tbl') {
                continue;
            }

            foreach ($xpath->query('./w:tr', $node) as $row) {
                $cells = [];
                foreach ($xpath->query('./w:tc', $row) as $cell) {
                    $cells[] = $this->wordText($xpath, $cell);
                }
                $lines[] = implode("\t", $cells);
            }
        }

        return implode("\n", $lines);
    }

    private function wordText(DOMXPath $xpath, \DOMNode $node): string
    {
        $parts = [];
        foreach ($xpath->query('.//w:t', $node) as $textNode) {
            $parts[] = $textNode->textContent;
        }

        return trim(implode('', $parts));
    }

    private function fromCells(array $cells, ?string $currentDate): ?array
    {
        foreach ($cells as $index => $cell) {
            if (! preg_match('/^(.+?)\s+vs\.?\s+(.+)$/iu', trim($cell), $teams)) {
                continue;
            }

            $competition = '';
            for ($previous = $index - 1; $previous >= 0; $previous--) {
                $candidate = trim($cells[$previous]);
                if ($candidate !== '' && ! preg_match('/^(?:\d{1,2}:\d{2}(?:\s*(?:am|pm))?|hora|time)$/iu', $candidate)) {
                    $competition = $candidate;
                    break;
                }
            }

            $time = null;
            foreach ($cells as $candidate) {
                if (preg_match('/^\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/iu', trim($candidate))) {
                    $time = trim($candidate);
                    break;
                }
            }
            $prediction = trim($cells[$index + 1] ?? '');
            $confidence = $this->parseConfidence($cells[$index + 2] ?? null);

            return $this->normalizeMatch(
                $teams[1],
                $teams[2],
                $competition,
                $prediction,
                $confidence,
                $this->kickoffAt($currentDate, $time)
            );
        }

        return null;
    }

    private function fromFreeTextLine(string $line, ?string $currentDate): ?array
    {
        if (! preg_match('/\bvs(?:\.|\b)/iu', $line)) {
            return null;
        }

        $line = preg_replace('/^\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+/iu', '', $line) ?? $line;
        $competition = '';
        foreach (['Premier League', 'Bundesliga', 'Ligue 1', 'La Liga', 'Serie A', 'Premier'] as $league) {
            if (preg_match('/^'.preg_quote($league, '/').'\s+/iu', $line, $prefix)) {
                $competition = $league;
                $line = substr($line, strlen($prefix[0]));
                break;
            }
        }

        if (! preg_match('/^(.+?)\s+vs\.?\s+(.+)$/iu', trim($line), $teams)) {
            return null;
        }

        $away = preg_replace('/\s+\d{1,3}%\s*$/u', '', trim($teams[2])) ?? trim($teams[2]);
        $away = preg_replace('/\s+(?:m[aá]s|menos)\s+de\b.*$/iu', '', $away) ?? $away;
        $away = preg_replace('/\s+.+?\s+gana(?:\s+.*)?$/iu', '', $away) ?? $away;
        $away = preg_replace('/\s+(?:ambos|doble oportunidad|empate)\b.*$/iu', '', $away) ?? $away;

        return $this->normalizeMatch($teams[1], $away, $competition, '', null, null);
    }

    private function normalizeMatch(
        string $homeTeam,
        string $awayTeam,
        string $competition,
        string $prediction = '',
        ?float $confidence = null,
        ?string $kickoffAt = null
    ): ?array
    {
        $homeTeam = trim(preg_replace('/\s+/u', ' ', $homeTeam) ?? $homeTeam);
        $awayTeam = trim(preg_replace('/\s+/u', ' ', $awayTeam) ?? $awayTeam);
        $competition = trim(preg_replace('/\s+/u', ' ', $competition) ?? $competition);
        $homeTeam = preg_replace('/^(?:partido|match)\s*:\s*/iu', '', $homeTeam) ?? $homeTeam;
        $awayTeam = trim(preg_replace('/\s+\d{1,3}%\s*$/u', '', $awayTeam) ?? $awayTeam);

        if (
            $homeTeam === ''
            || $awayTeam === ''
            || $this->isTableHeading($homeTeam)
            || $this->isTableHeading($awayTeam)
            || mb_strlen($homeTeam) > 120
            || mb_strlen($awayTeam) > 120
            || mb_strlen($competition) > 160
            || mb_strlen($prediction) > 120
        ) {
            return null;
        }

        return [
            'homeTeam' => $homeTeam,
            'awayTeam' => $awayTeam,
            'competition' => $competition,
            'prediction' => $prediction,
            'confidence' => $confidence,
            'kickoffAt' => $kickoffAt,
        ];
    }

    private function dateFromHeading(string $line): ?string
    {
        if (! preg_match(
            '/^(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?(\d{1,2})\s+(?:de\s+)?([[:alpha:]]+)(?:\s+(\d{4}))?/iu',
            trim($line),
            $parts
        )) {
            return null;
        }

        $months = [
            'ene' => 1, 'enero' => 1, 'jan' => 1, 'january' => 1,
            'feb' => 2, 'febrero' => 2, 'february' => 2,
            'mar' => 3, 'marzo' => 3, 'march' => 3,
            'abr' => 4, 'abril' => 4, 'apr' => 4, 'april' => 4,
            'may' => 5, 'mayo' => 5,
            'jun' => 6, 'junio' => 6, 'june' => 6,
            'jul' => 7, 'julio' => 7, 'july' => 7,
            'ago' => 8, 'agosto' => 8, 'aug' => 8, 'august' => 8,
            'sep' => 9, 'sept' => 9, 'septiembre' => 9, 'september' => 9,
            'oct' => 10, 'octubre' => 10, 'october' => 10,
            'nov' => 11, 'noviembre' => 11, 'november' => 11,
            'dic' => 12, 'diciembre' => 12, 'dec' => 12, 'december' => 12,
        ];
        $month = $months[mb_strtolower($parts[2])] ?? null;
        if ($month === null) {
            return null;
        }

        $year = isset($parts[3]) ? (int) $parts[3] : (int) date('Y');
        $date = sprintf('%04d-%02d-%02d', $year, $month, (int) $parts[1]);
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);

        return $parsed && $parsed->format('Y-m-d') === $date ? $date : null;
    }

    private function kickoffAt(?string $date, ?string $time): ?string
    {
        if ($date === null || $time === null) {
            return null;
        }
        if (! preg_match('/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/iu', $time, $parts)) {
            return null;
        }

        $hour = (int) $parts[1];
        $minute = (int) $parts[2];
        $period = strtolower($parts[3] ?? '');
        if ($minute > 59 || $hour > ($period === '' ? 23 : 12) || ($period !== '' && $hour === 0)) {
            return null;
        }
        if ($period === 'pm' && $hour < 12) {
            $hour += 12;
        } elseif ($period === 'am' && $hour === 12) {
            $hour = 0;
        }

        return sprintf('%sT%02d:%02d:00', $date, $hour, $minute);
    }

    private function parseConfidence(?string $value): ?float
    {
        if (! is_string($value) || ! preg_match('/^\s*(\d{1,3})(?:[.,]\d+)?\s*%\s*$/u', $value, $match)) {
            return null;
        }

        $confidence = (float) str_replace(',', '.', trim($value, " %\t\n\r\0\x0B"));

        return $confidence >= 0 && $confidence <= 100 ? $confidence : null;
    }

    private function addMatch(array &$matches, ?array $match): void
    {
        if (! $match) {
            return;
        }

        $key = implode('|', array_map(
            fn (string $value) => mb_strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value),
            [
                $match['homeTeam'],
                $match['awayTeam'],
                $match['competition'],
                $match['prediction'],
                $match['kickoffAt'] ?? '',
            ]
        ));
        $matches[$key] = $match;
    }

    private function isTableHeading(string $line): bool
    {
        return (bool) preg_match('/^(?:hora|time|liga|league|partido|match|pron[oó]stico|prediction|%|porcentaje)$/iu', trim($line));
    }
}
