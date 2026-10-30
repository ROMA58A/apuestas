<?php

namespace Tests\Feature;

use App\Services\MatchDocumentImporter;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;
use ZipArchive;

class MatchDocumentImporterTest extends TestCase
{
    public function test_it_extracts_matches_and_competitions_from_pasted_table_text(): void
    {
        $matches = app(MatchDocumentImporter::class)->parse(implode("\n", [
            'Partidos y pronósticos',
            'Viernes 30 de octubre',
            'Hora',
            'Liga',
            'Partido',
            'Pronóstico',
            '%',
            "12:00 PM\tLigue 1\tLe Havre vs PSG\tPSG gana\t80%",
            "1:30 PM\tBundesliga\tElversberg vs Mainz\tMás de 0.5 goles\t--",
            "2:00 PM\tLigue 1\tLe Havre vs PSG\tMás de 1.5 goles\t93%",
        ]));

        $year = date('Y');
        $this->assertSame([
            [
                'homeTeam' => 'Le Havre',
                'awayTeam' => 'PSG',
                'competition' => 'Ligue 1',
                'prediction' => 'PSG gana',
                'confidence' => 80.0,
                'kickoffAt' => "{$year}-10-30T12:00:00",
            ],
            [
                'homeTeam' => 'Elversberg',
                'awayTeam' => 'Mainz',
                'competition' => 'Bundesliga',
                'prediction' => 'Más de 0.5 goles',
                'confidence' => null,
                'kickoffAt' => "{$year}-10-30T13:30:00",
            ],
            [
                'homeTeam' => 'Le Havre',
                'awayTeam' => 'PSG',
                'competition' => 'Ligue 1',
                'prediction' => 'Más de 1.5 goles',
                'confidence' => 93.0,
                'kickoffAt' => "{$year}-10-30T14:00:00",
            ],
        ], $matches);
    }

    public function test_it_reads_match_rows_from_a_docx_table(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'match-docx-');
        $archive = new ZipArchive;
        $archive->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $archive->addFromString('word/document.xml', <<<'XML'
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:r><w:t>Viernes 30 de octubre</w:t></w:r></w:p>
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>Hora</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Liga</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Partido</w:t></w:r></w:p></w:tc>
                  </w:tr>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>12:00 PM</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Ligue 1</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Le Havre vs PSG</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
                <w:sectPr/>
              </w:body>
            </w:document>
            XML);
        $archive->close();

        try {
            $file = new UploadedFile(
                $path,
                'pronosticos.docx',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                UPLOAD_ERR_OK,
                true
            );

            $this->assertSame([
                [
                    'homeTeam' => 'Le Havre',
                    'awayTeam' => 'PSG',
                    'competition' => 'Ligue 1',
                    'prediction' => '',
                    'confidence' => null,
                    'kickoffAt' => date('Y').'-10-30T12:00:00',
                ],
            ], app(MatchDocumentImporter::class)->fromUpload($file));
        } finally {
            unlink($path);
        }
    }

    public function test_it_extracts_matches_from_a_text_based_pdf(): void
    {
        $text = 'Ligue 1 | Le Havre vs PSG';
        $content = 'BT /F1 12 Tf 50 750 Td ('.$text.') Tj ET';
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Length '.strlen($content)." >>\nstream\n".$content."\nendstream",
        ];
        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1)." 0 obj\n".$object."\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 6\n0000000000 65535 f \n";
        foreach (array_slice($offsets, 1) as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n".$xref."\n%%EOF\n";

        $path = tempnam(sys_get_temp_dir(), 'match-pdf-');
        file_put_contents($path, $pdf);

        try {
            $file = new UploadedFile($path, 'pronosticos.pdf', 'application/pdf', UPLOAD_ERR_OK, true);

            $this->assertSame([
                [
                    'homeTeam' => 'Le Havre',
                    'awayTeam' => 'PSG',
                    'competition' => 'Ligue 1',
                    'prediction' => '',
                    'confidence' => null,
                    'kickoffAt' => null,
                ],
            ], app(MatchDocumentImporter::class)->fromUpload($file));
        } finally {
            unlink($path);
        }
    }

    public function test_it_rejects_text_without_any_matches(): void
    {
        $this->expectException(ValidationException::class);
        app(MatchDocumentImporter::class)->parse('No hay partidos en este documento.');
    }
}
