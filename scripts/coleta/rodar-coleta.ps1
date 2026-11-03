# Inicia (ou retoma) a coleta em lote de dados públicos dos municípios-alvo.
# Cada fonte roda num processo Node separado, em segundo plano, independente
# do Claude: continua mesmo que a sessão feche ou o limite de uso acabe.
# Seguro para rodar várias vezes (ex.: por uma tarefa agendada): fonte que já
# está rodando ou já terminou não é iniciada de novo; o que faltou é retomado.
#
# Uso: powershell -ExecutionPolicy Bypass -File scripts\coleta\rodar-coleta.ps1

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$dados = Join-Path $raiz 'dados-coletados'
$estado = Join-Path $dados '_estado'
New-Item -ItemType Directory -Force -Path (Join-Path $dados '_logs') | Out-Null

if (-not (Test-Path (Join-Path $dados 'alvos.json'))) {
    Write-Output 'alvos.json não existe: rode antes  npx tsx scripts/coleta/exportar-alvos.ts'
    exit 1
}

$node = (Get-Command node -ErrorAction Stop).Source
$fontes = @('pncp', 'siconfi', 'diarios', 'compras', 'pncp-orgaos')
# Coletores estaduais (TCEs, diários das associações...): um arquivo por fonte em fontes\
$dirFontes = Join-Path $PSScriptRoot 'fontes'
if (Test-Path $dirFontes) {
    $fontes += Get-ChildItem $dirFontes -Filter '*.mjs' | Where-Object { $_.BaseName -match '^[a-z0-9-]+$' } | ForEach-Object { $_.BaseName }
}

foreach ($fonte in $fontes) {
    $lock = Join-Path $estado "$fonte.lock"
    if (Test-Path $lock) {
        try {
            $procId = (Get-Content $lock -Raw | ConvertFrom-Json).pid
            if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
                Write-Output "$fonte : já está rodando (pid $procId)"
                continue
            }
        } catch {}
    }
    # pncp e pncp-orgaos usam a mesma API (limite de ~1 chamada/s): uma de cada vez.
    if ($fonte -eq 'pncp-orgaos') {
        $lockPncp = Join-Path $estado 'pncp.lock'
        if (Test-Path $lockPncp) {
            try {
                $pidPncp = (Get-Content $lockPncp -Raw | ConvertFrom-Json).pid
                if (Get-Process -Id $pidPncp -ErrorAction SilentlyContinue) {
                    Write-Output "$fonte : aguardando a fonte pncp terminar (mesma API)"
                    continue
                }
            } catch {}
        }
    }
    $status = Join-Path $estado "$fonte.status.json"
    if (Test-Path $status) {
        try {
            if ((Get-Content $status -Raw | ConvertFrom-Json).concluido -eq $true) {
                Write-Output "$fonte : concluída"
                continue
            }
        } catch {}
    }
    $saida = Join-Path $dados "_logs\$fonte.saida.txt"
    $p = Start-Process -FilePath $node -ArgumentList @('scripts/coleta/coletar.mjs', $fonte) `
        -WorkingDirectory $raiz -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $saida -RedirectStandardError "$saida.erro"
    Write-Output "$fonte : iniciada (pid $($p.Id))"
}
