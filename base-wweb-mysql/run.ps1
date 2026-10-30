$ErrorActionPreference = 'Stop'

function Get-ConfiguredPort {
    param(
        [string]$Name,
        [int]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        $dotenvPath = Join-Path $PSScriptRoot '.env'
        if (Test-Path $dotenvPath) {
            foreach ($line in Get-Content $dotenvPath) {
                if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*?)\s*$") {
                    $value = $Matches[1].Trim().Trim([char[]]@('"', "'"))
                    $value = ($value -split '\s+#', 2)[0].Trim()
                    break
                }
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    $port = 0
    if (-not [int]::TryParse($value, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        throw "$Name debe ser un puerto entre 1 y 65535."
    }
    return $port
}

if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    throw 'No esta disponible Get-NetTCPConnection. Ejecuta este lanzador en Windows PowerShell.'
}

$portalPort = Get-ConfiguredPort -Name 'PORT' -DefaultValue 3000
$apiPort = Get-ConfiguredPort -Name 'MATCH_API_PORT' -DefaultValue 3001
$runtimeFile = Join-Path $PSScriptRoot '.bot-runtime.json'
$projectRoot = (Resolve-Path $PSScriptRoot).Path
$previousBot = $null
$legacyBotProcessId = $null

if (Test-Path $runtimeFile) {
    try {
        $runtime = Get-Content -Raw $runtimeFile | ConvertFrom-Json
        if ($runtime.projectRoot -eq $projectRoot -and $runtime.pid -is [int]) {
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($runtime.pid)" -ErrorAction SilentlyContinue
            if ($processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match '(?i)\bapp\.js\b') {
                if ($runtime.stopPort -is [int] -and $runtime.stopToken -is [string]) {
                    $previousBot = [pscustomobject]@{
                        ProcessId = $runtime.pid
                        StopPort = $runtime.stopPort
                        StopToken = $runtime.stopToken
                    }
                }
                else {
                    $legacyBotProcessId = $runtime.pid
                }
            }
        }
    }
    catch {
        Write-Warning 'No se pudo leer el estado del bot anterior; se verificaran los puertos iniciales.'
    }
}

if ($legacyBotProcessId) {
    throw "La instancia anterior del bot (PID $legacyBotProcessId) no tiene cierre ordenado. Ve a su terminal, pulsa Ctrl+C y luego vuelve a ejecutar .\run.ps1."
}

if ($previousBot) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($previousBot.ProcessId)" -ErrorAction SilentlyContinue
    if (
        $processInfo.Name -eq 'node.exe' -and
        $processInfo.CommandLine -match '(?i)\bapp\.js\b'
    ) {
        Write-Host "Solicitando el cierre ordenado de la instancia anterior (PID $($previousBot.ProcessId))."
        try {
            Invoke-RestMethod `
                -Uri "http://127.0.0.1:$($previousBot.StopPort)/stop" `
                -Method Post `
                -Headers @{ Authorization = "Bearer $($previousBot.StopToken)" } `
                -TimeoutSec 5 | Out-Null
        }
        catch {
            throw 'El bot anterior no respondió al cierre ordenado. No se terminó el proceso a la fuerza; ciérralo con Ctrl+C en su terminal e inténtalo de nuevo.'
        }
        for ($attempt = 0; $attempt -lt 120; $attempt++) {
            if (-not (Get-Process -Id $previousBot.ProcessId -ErrorAction SilentlyContinue)) {
                break
            }
            Start-Sleep -Milliseconds 250
        }
        if (Get-Process -Id $previousBot.ProcessId -ErrorAction SilentlyContinue) {
            throw 'El bot no terminó dentro de 30 segundos. No se terminó el proceso a la fuerza.'
        }
        Write-Host 'La instancia anterior cerró WhatsApp y MySQL de forma ordenada.'
    }
}

$portalOwners = @(
    Get-NetTCPConnection -State Listen -LocalPort $portalPort -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
)
$apiOwners = @(
    Get-NetTCPConnection -State Listen -LocalPort $apiPort -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
)
$unmanagedBot = @($portalOwners + $apiOwners | Select-Object -Unique) | Where-Object {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $_" -ErrorAction SilentlyContinue
    $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match '(?i)\bapp\.js\b'
}
if ($unmanagedBot.Count -gt 0) {
    throw "Ya hay una instancia node app.js (PID $($unmanagedBot -join ', ')) en un puerto configurado sin control de cierre. No se terminó ningún proceso; ciérrala con Ctrl+C en su terminal."
}

Push-Location $PSScriptRoot
try {
    & npm.cmd start
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($null -eq $exitCode) {
    $exitCode = 1
}
exit $exitCode
