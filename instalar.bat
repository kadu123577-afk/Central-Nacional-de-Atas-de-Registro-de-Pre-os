@echo off

echo.
echo === Passo 1: instalando as dependencias ===
call npm install
if errorlevel 1 goto :erro

if not exist .env (
  echo.
  echo === Passo 2: criando o arquivo .env ===
  copy .env.example .env >nul
  echo Arquivo .env criado com os valores padrao de desenvolvimento local.
  echo Se voce instalou o PostgreSQL com uma senha diferente de "localdev",
  echo abra o .env e ajuste a linha DATABASE_URL.
) else (
  echo.
  echo === Passo 2: .env ja existe, pulando ===
)

echo.
echo === Passo 3: gerando o SESSION_SECRET (se ainda nao tiver um) ===
powershell -NoProfile -Command "$c = Get-Content .env -Raw; if ($c -match 'SESSION_SECRET=\"\"') { $b = New-Object byte[] 32; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); $h = ($b | ForEach-Object { $_.ToString('x2') }) -join ''; $c = $c -replace 'SESSION_SECRET=\"\"', ('SESSION_SECRET=\"' + $h + '\"'); Set-Content .env $c -NoNewline; Write-Host 'SESSION_SECRET gerado automaticamente.' } else { Write-Host 'SESSION_SECRET ja estava configurado.' }"

echo.
echo === Passo 4: criando as tabelas do banco (o PostgreSQL precisa estar rodando) ===
call npx prisma migrate deploy
if errorlevel 1 goto :erro

echo.
echo === Passo 5: gerando o Prisma Client ===
call npx prisma generate
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo   Tudo pronto!
echo   Agora crie seu usuario admin (so precisa fazer uma vez):
echo     set ADMIN_EMAIL=seu-email@tech10.com.br
echo     set ADMIN_SENHA=escolha-uma-senha-com-8-caracteres
echo     npm run seed:admin
echo.
echo   Depois, pra abrir o site: iniciar.bat
echo ============================================================
goto :fim

:erro
echo.
echo ============================================================
echo   Alguma coisa deu errado num dos passos acima.
echo   Tira um print de tudo que apareceu na tela e manda.
echo ============================================================

:fim
pause
