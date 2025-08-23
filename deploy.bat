@echo off
echo ================================================
echo   SHUREPRINT QUOTE BUILDER - DEPLOYMENT SCRIPT
echo ================================================
echo.

echo [1/4] Checking Firebase authentication...
firebase projects:list >nul 2>&1
if errorlevel 1 (
    echo ERROR: Not authenticated with Firebase
    echo Please run: firebase login
    pause
    exit /b 1
)

echo [2/4] Building project...
echo Copying files to public directory...

echo [3/4] Deploying to Firebase Hosting...
firebase deploy --only hosting

if errorlevel 1 (
    echo ERROR: Deployment failed
    pause
    exit /b 1
)

echo.
echo ================================================
echo   DEPLOYMENT SUCCESSFUL!
echo ================================================
echo.
echo Your app is now live at:
echo https://shureprint-quote-builder.web.app
echo.
echo Quote Builder URL:
echo https://shureprint-quote-builder.web.app/quote-builder.html
echo.
pause