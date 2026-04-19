@echo off
title SCI Signage Server
echo ---------------------------------------
echo Starting Star Theater Signage Server...
echo ---------------------------------------

:: 1. Navigate to your folder
cd /d "C:\Users\dan.kreipke\Downloads\signageTool"

:: 2. Open the browser tabs FIRST
echo Opening Admin Portal and Star Theater Display...
start "" "http://localhost:3000/admin"
start "" "http://localhost:3000/display/star-theater.html"

:: 3. Start the Node server (This keeps the window open)
echo Launching Server...
node server.js

:: The script will "rest" here while the server runs.
pause