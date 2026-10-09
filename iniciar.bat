@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Central de Impressao

rem Verifica e instala tudo o que a central precisa, depois sobe os servicos.
rem Programas faltando sao instalados via winget (pode pedir permissao de administrador).

echo ============================================================
echo  Central de Impressao - verificando dependencias
echo ============================================================

rem ---------- Node.js (>= 20.12, por causa do process.loadEnvFile) ----------
call :node_ok && goto node_pronto
echo [..] Node.js ausente ou antigo. Instalando Node.js LTS...
call :winget OpenJS.NodeJS.LTS || goto falha
call :atualizar_path
call :node_ok || (echo [ERRO] Node.js instalado, mas nao encontrado. Feche e abra o iniciar.bat de novo. & goto falha)
:node_pronto
for /f "delims=" %%V in ('node --version') do echo [ok] Node.js %%V

rem ---------- Python 3 ----------
call :achar_python && goto python_pronto
echo [..] Python 3 nao encontrado. Instalando Python 3.12...
call :winget Python.Python.3.12 || goto falha
call :atualizar_path
call :achar_python || (echo [ERRO] Python instalado, mas nao encontrado. Feche e abra o iniciar.bat de novo. & goto falha)
:python_pronto
echo [ok] Python: %PYEXE%

rem ---------- LibreOffice (converte/imprime os termos) ----------
if exist "%ProgramFiles%\LibreOffice\program\soffice.exe" goto lo_pronto
if exist "%ProgramFiles(x86)%\LibreOffice\program\soffice.exe" goto lo_pronto
echo [..] LibreOffice nao encontrado. Instalando...
call :winget TheDocumentFoundation.LibreOffice || goto falha
:lo_pronto
echo [ok] LibreOffice

rem ---------- Driver ODBC 18 para SQL Server (consulta das matriculas) ----------
reg query "HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server" >nul 2>&1 && goto odbc_pronto
echo [..] ODBC Driver 18 for SQL Server nao encontrado. Instalando...
call :winget Microsoft.msodbcsql.18 || goto falha
:odbc_pronto
echo [ok] ODBC Driver 18 for SQL Server

rem ---------- Proxy para pip/npm ----------
call :configurar_proxy

rem ---------- Ambiente virtual + pacotes Python ----------
if exist "termos\venv\Scripts\python.exe" goto venv_pronto
echo [..] Criando ambiente virtual em termos\venv...
%PYEXE% -m venv "termos\venv" || goto falha
:venv_pronto
rem So reinstala quando o requirements.txt mudar desde a ultima instalacao.
fc /b "termos\requirements.txt" "termos\venv\requirements.instalado" >nul 2>&1 && goto pip_pronto
:pip_instalar
echo [..] Instalando pacotes Python...
"termos\venv\Scripts\python.exe" -m pip install --upgrade pip --disable-pip-version-check -q
"termos\venv\Scripts\python.exe" -m pip install -r "termos\requirements.txt" --disable-pip-version-check || goto pip_falhou
copy /y "termos\requirements.txt" "termos\venv\requirements.instalado" >nul
goto pip_pronto
:pip_falhou
rem venv copiado de outra maquina ou com pip quebrado: recria uma vez e tenta de novo.
if defined VENV_RECRIADO goto falha
set "VENV_RECRIADO=1"
echo [..] Falha no ambiente virtual. Recriando termos\venv...
rmdir /s /q "termos\venv" || goto falha
%PYEXE% -m venv "termos\venv" || goto falha
goto pip_instalar
:pip_pronto
echo [ok] Pacotes Python

rem ---------- Pacotes Node do WhatsApp (inclui Chromium e SumatraPDF) ----------
fc /b "whatsapp\package-lock.json" "whatsapp\node_modules\.lock.instalado" >nul 2>&1 && goto npm_pronto
echo [..] Instalando pacotes do WhatsApp (pode demorar, baixa o Chromium)...
pushd whatsapp
call npm install --no-audit --no-fund
if errorlevel 1 (popd & goto falha)
popd
copy /y "whatsapp\package-lock.json" "whatsapp\node_modules\.lock.instalado" >nul
:npm_pronto
echo [ok] Pacotes do WhatsApp

rem ---------- Configuracao (.env na raiz) ----------
if exist ".env" goto env_pronto
copy /y "termos\.env.example" ".env" >nul
echo.
echo [!!] Criado o arquivo .env a partir do modelo. Preencha DB_USER e DB_PASSWORD
echo      (e PRINTER_NAME, se quiser uma impressora especifica), salve e feche o Bloco de Notas.
start /wait notepad ".env"
:env_pronto
echo [ok] .env

if not exist "termos\templates\" echo [!!] Pasta termos\templates nao existe: copie os modelos .docx dos termos para la.

echo ============================================================
echo.
node iniciar.js
pause
exit /b 0

:falha
echo.
echo [ERRO] Nao foi possivel preparar o ambiente. Veja as mensagens acima.
pause
exit /b 1

rem ================= rotinas =================

:node_ok
where node >nul 2>&1 || exit /b 1
node -e "process.exit(typeof process.loadEnvFile === 'function' ? 0 : 1)" >nul 2>&1
exit /b %errorlevel%

:achar_python
set "PYEXE="
where py >nul 2>&1 && py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1 && set "PYEXE=py -3" && exit /b 0
where python >nul 2>&1 && python -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >nul 2>&1 && set "PYEXE=python" && exit /b 0
exit /b 1

:winget
where winget >nul 2>&1 || (echo [ERRO] winget nao disponivel. Instale "%~1" manualmente. & exit /b 1)
winget install -e --id %~1 --silent --accept-package-agreements --accept-source-agreements
rem Codigos de erro do winget sao negativos; -1978335189 = ja instalado.
if "%errorlevel%"=="0" exit /b 0
if "%errorlevel%"=="-1978335189" exit /b 0
echo [ERRO] Falha ao instalar %~1.
exit /b 1

:configurar_proxy
rem Usa o proxy das variaveis HTTPS_PROXY/HTTP_PROXY ou, se nao houver, o proxy do Windows.
rem O proxy da rede so fala HTTP: com "https://" o pip falha com SSL WRONG_VERSION_NUMBER.
set "PROXY_URL="
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$u = $env:HTTPS_PROXY; if (-not $u) { $u = $env:HTTP_PROXY }; if (-not $u) { $s = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue; if ($s.ProxyEnable -eq 1 -and $s.ProxyServer) { $u = $s.ProxyServer; if ($u -match 'https=([^;]+)') { $u = $Matches[1] } elseif ($u -match 'http=([^;]+)') { $u = $Matches[1] } } }; if ($u) { 'http://' + ($u -replace '^https?://', '') }"`) do set "PROXY_URL=%%U"
if not defined PROXY_URL exit /b 0
set "HTTP_PROXY=%PROXY_URL%"
set "HTTPS_PROXY=%PROXY_URL%"
set "NO_PROXY=localhost,127.0.0.1"
set "npm_config_proxy=%PROXY_URL%"
set "npm_config_https_proxy=%PROXY_URL%"
echo [ok] Proxy: %PROXY_URL%
exit /b 0

:atualizar_path
rem Programas recem-instalados alteram o PATH do registro, nao o desta janela.
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"
exit /b 0
