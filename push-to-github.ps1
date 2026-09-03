<#
.SYNOPSIS
  Point this repo at your GitHub repo and push it.

.DESCRIPTION
  Create the empty repo on github.com FIRST:
    New repository -> name it -> do NOT tick "Add a README".
  This repo already has a README, and that extra commit on GitHub's side
  makes the first push get rejected as a non-fast-forward.

.EXAMPLE
  .\push-to-github.ps1 pabasara-imadu
  .\push-to-github.ps1 pabasara-imadu my-quiz-app
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$GitHubUsername,

    [Parameter(Position = 1)]
    [string]$RepoName = 'quizarena'
)

$ErrorActionPreference = 'Stop'

# Guard against the placeholder being pasted verbatim - the exact mistake this
# script exists to prevent.
if ($GitHubUsername -in @('YOUR-USERNAME', 'your-username', 'USERNAME', 'username')) {
    Write-Host "'$GitHubUsername' is the placeholder, not your username." -ForegroundColor Red
    Write-Host "Use your real GitHub username, e.g. .\push-to-github.ps1 pabasara-imadu"
    exit 1
}

Set-Location -Path $PSScriptRoot

$remoteUrl = "https://github.com/$GitHubUsername/$RepoName.git"

# Replace any existing origin so a previous bad remote cannot linger.
git remote remove origin 2>$null
git remote add origin $remoteUrl

Write-Host "Pushing to $remoteUrl (branch: main)" -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push failed. The two usual causes:" -ForegroundColor Yellow
    Write-Host "  1. The repo does not exist yet - create it on github.com first."
    Write-Host "  2. You ticked 'Add a README' when creating it. Fix with:"
    Write-Host "       git pull --rebase origin main; git push -u origin main"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Pushed. Now open this and confirm you can SEE the file:" -ForegroundColor Green
Write-Host "  https://github.com/$GitHubUsername/$RepoName/blob/main/render.yaml"
Write-Host ""
Write-Host "Only once that page loads, go to Render -> New -> Blueprint."
