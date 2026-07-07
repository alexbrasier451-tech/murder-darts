param(
  [string]$RepoName = "murder-darts",
  [switch]$Private
)

$ErrorActionPreference = "Stop"

function Resolve-Gh {
  $command = Get-Command gh -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $fallback = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "GitHub CLI was not found. Install it with: winget install --id GitHub.cli -e"
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

$gh = Resolve-Gh

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not logged in. Run: gh auth login --hostname github.com --git-protocol https --web --scopes repo"
}

$insideRepo = git rev-parse --is-inside-work-tree
if ($LASTEXITCODE -ne 0 -or $insideRepo.Trim() -ne "true") {
  throw "Run this script from inside the Murder Darts git repository."
}

$branch = (git branch --show-current).Trim()
if (-not $branch) {
  throw "Could not determine the current git branch."
}

$status = git status --short
if ($status) {
  throw "Commit or stash local changes before publishing. Current status:`n$status"
}

$visibility = if ($Private) { "--private" } else { "--public" }
$hasOrigin = (git remote) -contains "origin"

if (-not $hasOrigin) {
  Invoke-Checked $gh @("repo", "create", $RepoName, $visibility, "--source", ".", "--remote", "origin", "--push") "Failed to create or push the GitHub repository."
} else {
  Invoke-Checked "git" @("push", "-u", "origin", $branch) "Failed to push to the existing origin remote."
}

$fullName = (& $gh repo view --json nameWithOwner --jq ".nameWithOwner").Trim()
if (-not $fullName) {
  throw "Could not determine the GitHub repository name."
}

& $gh api "repos/$fullName/pages" --method POST -f "source[branch]=$branch" -f "source[path]=/" | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $gh api "repos/$fullName/pages" --method PUT -f "source[branch]=$branch" -f "source[path]=/" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to enable or update GitHub Pages."
  }
}

$pagesUrl = (& $gh api "repos/$fullName/pages" --jq ".html_url").Trim()
Write-Host ""
Write-Host "Published: https://github.com/$fullName"
Write-Host "Pages URL: $pagesUrl"
Write-Host "GitHub can take a minute or two to publish the first Pages build."