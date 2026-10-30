param([ValidateSet('setup','build','test','benchmark','visuals','run')][string]$Action = 'run')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousPath = $env:PATH
Push-Location $projectRoot
try {
    function Invoke-Checked {
        param([string]$Program, [string[]]$Arguments)
        & $Program @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE)." }
    }
    if ($Action -eq 'setup') {
        Invoke-Checked 'python' @('tools/setup-native.py')
        return
    }
    $compilerBin = Join-Path $projectRoot '.tools/llvm/llvm-mingw-20261020-ucrt-x86_64/bin'
    $cmake = Join-Path $projectRoot '.tools/python/cmake/data/bin/cmake.exe'
    $ninja = Join-Path $projectRoot '.tools/python/bin/ninja.exe'
    $compiler = Join-Path $compilerBin 'clang++.exe'
    $bindings = Join-Path $projectRoot '.tools/bindings/godot-cpp-e83fd0904c13356ed1d4c3d09f8bb9132bdc6b77'
    $godot = Join-Path $projectRoot '.tools/godot/Godot_v4.7.2-stable_win64_console.exe'
    foreach ($required in @($cmake, $ninja, $compiler, "$bindings/CMakeLists.txt", $godot)) {
        if (!(Test-Path -LiteralPath $required)) { throw 'Native tools are missing. First run: powershell -File tools/native.ps1 -Action setup' }
    }
    $env:PATH = $compilerBin + ';' + $env:PATH
    Invoke-Checked 'node' @('tools/export-native-data.mjs')
    Invoke-Checked 'node' @('tools/export-sandbox-data.mjs')
    if (!(Test-Path 'native/build/build.ninja')) {
        Invoke-Checked $cmake @('-S', 'native', '-B', 'native/build', '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release', "-DCMAKE_MAKE_PROGRAM=$ninja", "-DCMAKE_CXX_COMPILER=$compiler", "-DGODOT_CPP_DIR=$bindings")
    }
    Invoke-Checked $cmake @('--build', 'native/build', '--parallel', '6')
    if ($Action -eq 'build') { return }
    if ($Action -eq 'benchmark') {
        Invoke-Checked 'node' @('tools/benchmark-native.mjs')
        return
    }
    New-Item -ItemType Directory -Force '.test-artifacts' | Out-Null
    New-Item -ItemType File -Force '.tools/godot/._sc_' | Out-Null
    Invoke-Checked $godot @('--headless', '--path', 'godot', '--editor', '--import', '--quit', '--log-file', "$projectRoot/.test-artifacts/godot-import.log")
    if ($Action -eq 'test') {
        Invoke-Checked 'node' @('tools/check-native.mjs')
        Invoke-Checked (Join-Path $projectRoot 'native/build/ecologist-chemistry-tests.exe') @()
        Invoke-Checked (Join-Path $projectRoot 'native/build/ecologist-sandbox-tests.exe') @()
        Invoke-Checked $godot @('--headless', '--path', 'godot', '--script', 'res://tests/workshop.gd', '--log-file', "$projectRoot/.test-artifacts/workshop-test.log")
        Invoke-Checked $godot @('--headless', '--path', 'godot', '--script', 'res://tests/integration.gd', '--log-file', "$projectRoot/.test-artifacts/godot-test.log")
        return
    }
    if ($Action -eq 'visuals') {
        Invoke-Checked 'node' @('tools/check-liquid-visuals.mjs')
        $visualLog = Join-Path $projectRoot '.test-artifacts/liquid-gpu.log'
        # Background screenshot tests should not take over the user's desktop focus.
        $visualArgs = @('--path', 'godot', '--script', 'res://tests/liquid_visuals.gd', '--audio-driver', 'Dummy', '--quit-after', '300', '--log-file', ('"' + $visualLog + '"'))
        $visualProcess = Start-Process -FilePath ($godot -replace '_console.exe$', '.exe') -ArgumentList $visualArgs -WindowStyle Hidden -PassThru
        if (!$visualProcess.WaitForExit(60000)) {
            $visualProcess.Kill()
            throw 'Godot visual comparison timed out.'
        }
        if ($visualProcess.ExitCode -ne 0) { throw 'Godot visual comparison failed.' }
        $visualOutput = Get-Content -LiteralPath $visualLog -Raw
        if ($visualOutput -match 'ERROR:|SCRIPT ERROR:|SHADER ERROR:') { throw $visualOutput }
        Invoke-Checked 'node' @('tools/check-liquid-visuals.mjs', '--compare')
        return
    }
    Invoke-Checked $godot @('--path', 'godot', '--log-file', "$projectRoot/.test-artifacts/godot-play.log")
} finally {
    $env:PATH = $previousPath
    Pop-Location
}
