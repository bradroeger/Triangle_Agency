[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$Start,
    [switch]$ConfigureArduino,
    [string]$ArduinoPort
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    Write-Host 'Triangle Agency first-run setup' -ForegroundColor Cyan

    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        throw 'Node.js 22 or newer (including npm) is required. Install the current Node.js LTS release from https://nodejs.org/, reopen PowerShell, and rerun this script.'
    }

    $nodeMajorText = (& node -p "process.versions.node.split('.')[0]").Trim()
    if ($LASTEXITCODE -ne 0 -or [int]$nodeMajorText -lt 22) {
        throw "Node.js 22 or newer is required; found $(node --version). Install the current Node.js LTS release and rerun setup."
    }
    Write-Host "Node.js $(node --version), npm $(npm --version)"

    if (-not (Test-Path 'package-lock.json')) {
        throw 'package-lock.json is missing. Run this script from a complete Triangle Agency checkout.'
    }

    if (-not $SkipInstall) {
        Write-Host 'Installing locked npm dependencies (npm ci)...' -ForegroundColor Cyan
        & npm ci
        if ($LASTEXITCODE -ne 0) {
            throw 'npm ci failed. If the error is EPERM unlink for node_modules\@pokusew\pcsclite\build\Release\pcsclite.node, close the running Triangle Agency server and other Node.js processes that may be using the project, then rerun setup. If it still fails, check whether antivirus is scanning the file and retry after it finishes. Do not run as Administrator for this file-lock error. For a compiler or node-gyp error, see the Windows native dependency prerequisites in README.md.'
        }
    }

    $requiredJson = @(
        'data/employees.json',
        'data/resources.json',
        'data/content.json',
        'data/triggers.json',
        'data/GM_message.json'
    )
    foreach ($file in $requiredJson) {
        if (-not (Test-Path $file -PathType Leaf)) {
            throw "Required application data is missing: $file"
        }
        try {
            Get-Content -Raw -LiteralPath $file | ConvertFrom-Json | Out-Null
        } catch {
            throw "Required application data is not valid JSON: $file ($($_.Exception.Message))"
        }
    }
    if (Test-Path 'data/playwall-content.json' -PathType Leaf) {
        try {
            Get-Content -Raw -LiteralPath 'data/playwall-content.json' | ConvertFrom-Json | Out-Null
        } catch {
            throw "Optional Playwall catalogue is not valid JSON: data/playwall-content.json ($($_.Exception.Message))"
        }
    }

    # The app creates state itself on startup. Create only empty append-only logs
    # here, and preserve all existing campaign state, logs, and local content.
    foreach ($file in @('data/access-log.jsonl', 'data/campaign-events.jsonl', 'data/device-access-log.jsonl')) {
        if (-not (Test-Path $file)) {
            New-Item -ItemType File -Path $file | Out-Null
            Write-Host "Initialized $file"
        }
    }

    if (Test-Path 'data/state.json') {
        try {
            Get-Content -Raw -LiteralPath 'data/state.json' | ConvertFrom-Json | Out-Null
        } catch {
            throw "Campaign state is not valid JSON: data/state.json ($($_.Exception.Message))"
        }
    } else {
        Write-Host 'Campaign state will be initialized safely by the application on first launch.'
    }

    if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        $smartCard = Get-Service -Name SCardSvr -ErrorAction SilentlyContinue
        if ($smartCard) {
            Write-Host "Windows Smart Card service: $($smartCard.Status) (setup does not change Windows services)."
        }
    }

    if ($ConfigureArduino) {
        $arduinoCli = Get-Command arduino-cli -ErrorAction SilentlyContinue
        if (-not $arduinoCli) {
            throw 'Arduino CLI is required for firmware setup. Install it from https://arduino.github.io/arduino-cli/latest/installation/, reopen PowerShell, and rerun with -ConfigureArduino.'
        }

        $ssid = Read-Host 'Wi-Fi network name (SSID)'
        if ([string]::IsNullOrWhiteSpace($ssid)) { throw 'Wi-Fi SSID cannot be empty.' }
        $securePassword = Read-Host 'Wi-Fi password' -AsSecureString
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try {
            $wifiPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
            $securePassword.Dispose()
        }

        function ConvertTo-CStringLiteral([string]$value) {
            $slash = [string][char]92
            return '"' + $value.Replace($slash, $slash + $slash).Replace('"', $slash + '"').Replace("`r", $slash + 'r').Replace("`n", $slash + 'n') + '"'
        }

        $secretHeader = @"
#pragma once
static const char* WIFI_SSID = $(ConvertTo-CStringLiteral $ssid);
static const char* WIFI_PASSWORD = $(ConvertTo-CStringLiteral $wifiPassword);
"@
        $secretPaths = @('wifi_secrets.h', 'src/arduino/sketch_sep21a/wifi_secrets.h')
        foreach ($secretPath in $secretPaths) {
            Set-Content -LiteralPath $secretPath -Value $secretHeader -Encoding ascii
        }
        $wifiPassword = $null
        $secretHeader = $null
        Write-Host 'Saved local Wi-Fi credentials in Git-ignored headers.'

        & arduino-cli core update-index
        if ($LASTEXITCODE -ne 0) { throw 'Arduino CLI could not update its board index.' }
        & arduino-cli core install esp32:esp32
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the Espressif ESP32 board core.' }
        & arduino-cli lib install 'Adafruit NeoPixel'
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the Adafruit NeoPixel library.' }

        foreach ($sketchPath in @('.', 'src/arduino/sketch_sep21a')) {
            & arduino-cli compile --fqbn esp32:esp32:esp32da $sketchPath
            if ($LASTEXITCODE -ne 0) { throw "Firmware compile failed for $sketchPath." }
        }
        if ($ArduinoPort) {
            & arduino-cli upload --fqbn esp32:esp32:esp32da --port $ArduinoPort src/arduino/sketch_sep21a
            if ($LASTEXITCODE -ne 0) { throw "Firmware upload failed on port $ArduinoPort." }
        } else {
            Write-Host 'Firmware compiled. Connect the ESP32 and rerun setup with -ConfigureArduino -ArduinoPort COM3 (replace COM3 with its port) to upload.'
        }
    }

    Write-Host 'Setup complete. Start the terminal with: npm start' -ForegroundColor Green
    Write-Host 'Open http://localhost:3000/office for the office display; the player and supervisor pages are also available.'
    if ($Start) {
        & npm start
        if ($LASTEXITCODE -ne 0) { throw 'The application exited with an error.' }
    }
} finally {
    Pop-Location
}
