<#
.SYNOPSIS
  Starts the Nexura development stack.

.DESCRIPTION
  Three independent npm packages live under apps/, each with its own
  package.json and lockfile, so there is no root `npm run dev` to lean on.
  This starts them together.

  By default it starts only what the BRANCH APP needs:

    local-server  :4000   the property server - every screen reads this
    web           :5173   the React app

  The central server is opt-in (-All). It backs the Org Portal and the
  Admin Console only; the branch app never calls it, and starting it when
  you are not testing those two screens is noise.

  Each service opens in its own window so one can be restarted without
  killing the others, and so a stack trace stays attached to the service
  that produced it.

.PARAMETER All
  Also start the central server (:5000). Needed for Org Portal / Admin
  Console.

.PARAMETER Seed
  Re-seed the local database before starting. DESTRUCTIVE - see the warning
  it prints. Needed on a first run, or after deleting the db file.

.PARAMETER Stop
  Stop whatever is listening on the Nexura ports and exit.

.PARAMETER Install
  Run `npm install` in each app first. Needed after a fresh clone or a
  branch switch that changed a lockfile.

.EXAMPLE
  .\dev.ps1
  Starts local-server and web.

.EXAMPLE
  .\dev.ps1 -All
  Starts local-server, central-server and web.

.EXAMPLE
  .\dev.ps1 -Stop
  Stops everything on ports 4000, 5000 and 5173.
#>
[CmdletBinding()]
param(
  [switch]$All,
  [switch]$Seed,
  [switch]$Stop,
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Service table. Order matters on start: the web app is friendlier to look at
# once the API behind it is already answering.
$services = @(
  @{ Name = "local-server";   Port = 4000; Path = "apps\local-server";   Cmd = "npm run dev"; Always = $true  },
  @{ Name = "central-server"; Port = 5000; Path = "apps\central-server"; Cmd = "npm run dev"; Always = $false },
  @{ Name = "web";            Port = 5173; Path = "apps\web";            Cmd = "npm run dev"; Always = $true  }
)

function Get-PortOwner {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
  } catch {
    return $null
  }
  if ($null -eq $conn) { return $null }
  try {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction Stop
    return [pscustomobject]@{ Pid = $conn.OwningProcess; Name = $proc.ProcessName }
  } catch {
    return [pscustomobject]@{ Pid = $conn.OwningProcess; Name = "unknown" }
  }
}

# ─── -Stop ────────────────────────────────────────────────────────────────
if ($Stop) {
  $stopped = 0
  foreach ($svc in $services) {
    $owner = Get-PortOwner -Port $svc.Port
    if ($null -eq $owner) {
      Write-Host ("  {0,-14} :{1}  not running" -f $svc.Name, $svc.Port) -ForegroundColor DarkGray
      continue
    }
    Write-Host ("  {0,-14} :{1}  stopping {2} (pid {3})" -f $svc.Name, $svc.Port, $owner.Name, $owner.Pid) -ForegroundColor Yellow
    try {
      Stop-Process -Id $owner.Pid -Force -ErrorAction Stop
      $stopped++
    } catch {
      Write-Host ("      could not stop pid {0}: {1}" -f $owner.Pid, $_.Exception.Message) -ForegroundColor Red
    }
  }
  Write-Host ""
  Write-Host ("Stopped {0} service(s)." -f $stopped) -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "Nexura dev stack" -ForegroundColor Cyan
Write-Host "----------------" -ForegroundColor Cyan

$wanted = $services | Where-Object { $_.Always -or $All }

# ─── Dependencies ─────────────────────────────────────────────────────────
# Checked rather than assumed: a missing node_modules produces an npm error
# that reads nothing like "you did not install".
foreach ($svc in $wanted) {
  $modules = Join-Path $root (Join-Path $svc.Path "node_modules")
  if ($Install -or -not (Test-Path $modules)) {
    Write-Host ("Installing dependencies for {0}..." -f $svc.Name) -ForegroundColor Yellow
    Push-Location (Join-Path $root $svc.Path)
    try {
      npm install
      if ($LASTEXITCODE -ne 0) { throw ("npm install failed in {0}" -f $svc.Path) }
    } finally {
      Pop-Location
    }
  }
}

# ─── Seed ─────────────────────────────────────────────────────────────────
if ($Seed) {
  Write-Host ""
  Write-Host "Re-seeding the local database." -ForegroundColor Yellow
  Write-Host "This rewrites demo data. Any reservation, charge or payment you" -ForegroundColor Yellow
  Write-Host "created by hand while testing will be gone." -ForegroundColor Yellow
  $answer = Read-Host "Type 'seed' to continue"
  if ($answer -ne "seed") {
    Write-Host "Skipped seeding." -ForegroundColor DarkGray
  } else {
    $owner = Get-PortOwner -Port 4000
    if ($null -ne $owner) {
      # better-sqlite3 holds a single connection; seeding under a live server
      # is how you get a locked database and a confusing half-written state.
      Write-Host "Stop the local server first (.\dev.ps1 -Stop) - it holds the database open." -ForegroundColor Red
      exit 1
    }
    Push-Location (Join-Path $root "apps\local-server")
    try {
      npm run seed
      if ($LASTEXITCODE -ne 0) { throw "Seeding failed." }
    } finally {
      Pop-Location
    }
    Write-Host "Seeded." -ForegroundColor Green
  }
}

# ─── Start ────────────────────────────────────────────────────────────────
Write-Host ""
$started = @()
foreach ($svc in $wanted) {
  $owner = Get-PortOwner -Port $svc.Port
  if ($null -ne $owner) {
    # Already up. Reusing it beats the EADDRINUSE crash that starting a second
    # copy produces, and beats killing something the user started on purpose.
    Write-Host ("  {0,-14} :{1}  already running ({2}, pid {3}) - reusing" -f $svc.Name, $svc.Port, $owner.Name, $owner.Pid) -ForegroundColor DarkGray
    continue
  }

  $dir = Join-Path $root $svc.Path
  $title = "nexura " + $svc.Name
  $command = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; " + $svc.Cmd
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $command | Out-Null
  Write-Host ("  {0,-14} :{1}  starting" -f $svc.Name, $svc.Port) -ForegroundColor Green
  $started += $svc.Name
}

Write-Host ""
Write-Host "  App          http://localhost:5173" -ForegroundColor White
Write-Host "  API          http://localhost:4000" -ForegroundColor White
if ($All) {
  Write-Host "  Central API  http://localhost:5000" -ForegroundColor White
}
Write-Host ""
Write-Host "  Sign in with any seeded account, password 'demo123'." -ForegroundColor DarkGray
Write-Host "  Route counts below are read from routes.tsx, not guessed:" -ForegroundColor DarkGray
Write-Host "    manager@grandpalms.ng     MGT  72 screens - full oversight" -ForegroundColor DarkGray
Write-Host "    frontdesk@grandpalms.ng   FD   36 screens - the wired ones live here" -ForegroundColor DarkGray
Write-Host "    finance@grandpalms.ng     FIN  26 screens - folios, invoices, day close" -ForegroundColor DarkGray
Write-Host "    housekeeper@grandpalms.ng HK   17 screens - narrowest role, good for" -ForegroundColor DarkGray
Write-Host "                                   checking the sidebar filter works" -ForegroundColor DarkGray
Write-Host "    owner@grandpalms.ng       ORG  adds Multi-Branch (needs -All)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Wired so far - these read real data:" -ForegroundColor DarkGray
Write-Host "    Front Desk > Arrivals List, Departures List, In-House Guests" -ForegroundColor DarkGray
Write-Host "    Reservations > Reservation Search" -ForegroundColor DarkGray
Write-Host "  Everything else still renders mock data." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Stop everything:  .\dev.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""

if ($started.Count -gt 0) {
  Write-Host "Vite takes a few seconds on a cold start; give it a moment before loading the page." -ForegroundColor DarkGray
  Write-Host ""
}
