@echo off
cls
echo ==========================================
echo    LIMPANDO E REFORCANDO SINCRONIZACAO
echo ==========================================

:: 1. Limpa configuracoes antigas do PC para evitar erros
if exist ".git" (
    echo [1/4] Limpando conexoes antigas...
    rd /s /q .git
)

:: 2. Reinicia do zero (jeito mais garantido)
echo [2/4] Iniciando nova conexao...
git init >nul
git remote add origin https://github.com/jeffersonmarumnusse/nutriscan-ai.git

:: 3. Prepara os arquivos
git config user.name "Usuario Nutriscan"
git config user.email "usuario@nutriscan.ai"
git add .
git commit -m "Reiniciando e aplicando correcoes" --author="Usuario <usuario@nutriscan.ai>" >nul

echo.
echo [3/4] Enviando direto para a gaveta 'principal'...
echo.
echo Se o navegador abrir pedindo login, POR FAVOR faca o login.
echo.

:: 4. Forca o envio para a branch principal (a que a Vercel usa)
git branch -M principal
git push -u origin principal -f

echo.
if %errorlevel% equ 0 (
    echo ==========================================
    echo    AGORA SIM! TUDO CONCLUIDO!
    echo.
    echo    Os arquivos ja estao na pasta principal.
    echo    Sua Vercel vai terminar de atualizar em breve.
    echo ==========================================
) else (
    echo [ERRO] O envio falhou. 
    echo Verifique se o GitHub pediu login no seu navegador!
)
pause
淘汰
