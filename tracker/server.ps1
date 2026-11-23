$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$ConfigPath = if (-not [string]::IsNullOrWhiteSpace($env:RA_CONFIG_PATH)) { $env:RA_CONFIG_PATH } else { Join-Path $Root 'config.json' }
$Port = 8765
$Prefix = "http://127.0.0.1:$Port/"

# Start with safe defaults so the control panel is available before credentials are entered.
$script:Config = [pscustomobject]@{
    username = ''
    apiKey = ''
    fixedGameId = ''
    fixedAchievementSetId = ''
    achievementMode = 'hardcore'
    refreshSeconds = 30
    nextAchievementCount = 3
    latestAchievementCount = 3
    overlayWidth = 480
    overlayHeight = 430
    displayMode = 'latest'
    aesthetics = [pscustomobject]@{
        fontFamily = 'Arial, Helvetica, sans-serif'
        gameTitle = [pscustomobject]@{ enabled = $true; size = 26; color = '#ffffff' }
        console = [pscustomobject]@{ enabled = $true; size = 20; color = '#f1f1f1' }
        progress = [pscustomobject]@{ enabled = $true; size = 20; color = '#ffffff' }
        sectionHeading = [pscustomobject]@{ enabled = $true; size = 20; color = '#ffffff' }
        achievementTitle = [pscustomobject]@{ enabled = $true; size = 24; color = '#ffffff' }
        achievementPoints = [pscustomobject]@{ enabled = $true; size = 24; color = '#ffffff' }
        achievementDescription = [pscustomobject]@{ enabled = $true; size = 18; color = '#ededed' }
        gameIcon = [pscustomobject]@{ enabled = $true }
        achievementIcons = [pscustomobject]@{ enabled = $true }
        emptyState = [pscustomobject]@{ enabled = $true }
        gameIconBorder = [pscustomobject]@{ enabled = $true; color = '#ffffff' }
        achievementIconBorder = [pscustomobject]@{ enabled = $true; color = '#ffffff' }
    }
}

if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    try {
        $loadedConfig = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
        if ($null -ne $loadedConfig) { $script:Config = $loadedConfig }
    } catch {
        Write-Host 'The saved config.json could not be read. The settings page will let you save a corrected configuration.' -ForegroundColor Yellow
    }
}

function Get-NormalizedAesthetics {
    param($InputAesthetics)

    $allowedFonts = @(
        'Arial, Helvetica, sans-serif',
        'Impact, sans-serif',
        'Verdana, Geneva, sans-serif',
        'Tahoma, Geneva, sans-serif',
        'Trebuchet MS, Arial, sans-serif',
        'Georgia, Times New Roman, serif',
        'Courier New, Courier, monospace',
        'Segoe UI, Arial, sans-serif'
    )
    $fontFamily = ''
    if ($null -ne $InputAesthetics) {
        if ($InputAesthetics -is [System.Collections.IDictionary]) {
            if ($InputAesthetics.Contains('fontFamily')) { $fontFamily = [string]$InputAesthetics['fontFamily'] }
        } else {
            $fontFamily = [string]$InputAesthetics.fontFamily
        }
    }
    if ($fontFamily -notin $allowedFonts) { $fontFamily = 'Arial, Helvetica, sans-serif' }

    $defaults = [ordered]@{
        gameTitle = [ordered]@{ size = 26; color = '#ffffff'; min = 14; max = 72 }
        console = [ordered]@{ size = 20; color = '#f1f1f1'; min = 12; max = 48 }
        progress = [ordered]@{ size = 20; color = '#ffffff'; min = 12; max = 64 }
        sectionHeading = [ordered]@{ size = 20; color = '#ffffff'; min = 12; max = 48 }
        achievementTitle = [ordered]@{ size = 24; color = '#ffffff'; min = 14; max = 96 }
        achievementPoints = [ordered]@{ size = 24; color = '#ffffff'; min = 14; max = 96 }
        achievementDescription = [ordered]@{ size = 18; color = '#ededed'; min = 12; max = 72 }
    }

    $result = [ordered]@{ fontFamily = $fontFamily }
    foreach ($key in $defaults.Keys) {
        $default = $defaults[$key]
        $saved = $null
        if ($null -ne $InputAesthetics) {
            if ($InputAesthetics -is [System.Collections.IDictionary]) {
                if ($InputAesthetics.Contains($key)) { $saved = $InputAesthetics[$key] }
            } else {
                $property = $InputAesthetics.PSObject.Properties[$key]
                if ($null -ne $property) { $saved = $property.Value }
            }
        }

        $savedEnabled = $null
        $savedSize = $null
        $savedColor = $null
        if ($null -ne $saved) {
            if ($saved -is [System.Collections.IDictionary]) {
                if ($saved.Contains('enabled')) { $savedEnabled = $saved['enabled'] }
                if ($saved.Contains('size')) { $savedSize = $saved['size'] }
                if ($saved.Contains('color')) { $savedColor = $saved['color'] }
            } else {
                $savedEnabled = $saved.enabled
                $savedSize = $saved.size
                $savedColor = $saved.color
            }
        }

        $enabled = $true
        if ($null -ne $savedEnabled) {
            try { $enabled = [System.Convert]::ToBoolean($savedEnabled) } catch { $enabled = $true }
        }

        $size = [int]$default.size
        if ($null -ne $savedSize) {
            try { $size = [Math]::Max([int]$default.min, [Math]::Min([int]$default.max, [int]$savedSize)) } catch { $size = [int]$default.size }
        }

        $color = [string]$default.color
        if ($null -ne $savedColor) {
            $candidateColor = [string]$savedColor
            if ($candidateColor -match '^#[0-9A-Fa-f]{6}$') { $color = $candidateColor.ToLowerInvariant() }
        }
        $result[$key] = [ordered]@{ enabled = $enabled; size = $size; color = $color }
    }

    $visibilityDefaults = [ordered]@{
        gameIcon = [ordered]@{ enabled = $true }
        achievementIcons = [ordered]@{ enabled = $true }
        emptyState = [ordered]@{ enabled = $true }
    }
    foreach ($key in $visibilityDefaults.Keys) {
        $savedVisibility = $null
        if ($null -ne $InputAesthetics) {
            if ($InputAesthetics -is [System.Collections.IDictionary]) {
                if ($InputAesthetics.Contains($key)) { $savedVisibility = $InputAesthetics[$key] }
            } else {
                $visibilityProperty = $InputAesthetics.PSObject.Properties[$key]
                if ($null -ne $visibilityProperty) { $savedVisibility = $visibilityProperty.Value }
            }
        }
        $savedEnabled = $null
        if ($null -ne $savedVisibility) {
            if ($savedVisibility -is [System.Collections.IDictionary]) {
                if ($savedVisibility.Contains('enabled')) { $savedEnabled = $savedVisibility['enabled'] }
            } else {
                $savedEnabled = $savedVisibility.enabled
            }
        }
        $enabled = $true
        if ($null -ne $savedEnabled) {
            try { $enabled = [System.Convert]::ToBoolean($savedEnabled) } catch { $enabled = $true }
        }
        $result[$key] = [ordered]@{ enabled = $enabled }
    }

    $borderDefaults = [ordered]@{
        gameIconBorder = [ordered]@{ enabled = $true; color = '#ffffff' }
        achievementIconBorder = [ordered]@{ enabled = $true; color = '#ffffff' }
    }
    foreach ($key in $borderDefaults.Keys) {
        $defaultBorder = $borderDefaults[$key]
        $savedBorder = $null
        if ($null -ne $InputAesthetics) {
            if ($InputAesthetics -is [System.Collections.IDictionary]) {
                if ($InputAesthetics.Contains($key)) { $savedBorder = $InputAesthetics[$key] }
            } else {
                $borderProperty = $InputAesthetics.PSObject.Properties[$key]
                if ($null -ne $borderProperty) { $savedBorder = $borderProperty.Value }
            }
        }

        $savedEnabled = $null
        $savedBorderColor = $null
        if ($null -ne $savedBorder) {
            if ($savedBorder -is [System.Collections.IDictionary]) {
                if ($savedBorder.Contains('enabled')) { $savedEnabled = $savedBorder['enabled'] }
                if ($savedBorder.Contains('color')) { $savedBorderColor = $savedBorder['color'] }
            } else {
                $savedEnabled = $savedBorder.enabled
                $savedBorderColor = $savedBorder.color
            }
        }

        $enabled = [bool]$defaultBorder.enabled
        if ($null -ne $savedEnabled) {
            try { $enabled = [System.Convert]::ToBoolean($savedEnabled) } catch { $enabled = [bool]$defaultBorder.enabled }
        }
        $borderColor = [string]$defaultBorder.color
        if ($null -ne $savedBorderColor) {
            $candidateBorderColor = [string]$savedBorderColor
            if ($candidateBorderColor -match '^#[0-9A-Fa-f]{6}$') { $borderColor = $candidateBorderColor.ToLowerInvariant() }
        }
        $result[$key] = [ordered]@{ enabled = $enabled; color = $borderColor }
    }
    return $result
}

function Set-TrackerRuntimeConfig {
    param([Parameter(Mandatory = $true)]$Configuration)
    $script:Config = $Configuration
    $script:Aesthetics = Get-NormalizedAesthetics -InputAesthetics $script:Config.aesthetics
    $script:Config | Add-Member -NotePropertyName aesthetics -NotePropertyValue $script:Aesthetics -Force
    $script:ConfigRevision = [Guid]::NewGuid().ToString('N')
    $script:Mode = ([string]$script:Config.achievementMode).ToLowerInvariant()
    if ($script:Mode -notin @('hardcore', 'softcore')) { $script:Mode = 'hardcore' }

    $script:RefreshSeconds = 30
    if ($null -ne $script:Config.refreshSeconds) {
        try { $script:RefreshSeconds = [Math]::Max(15, [Math]::Min(300, [int]$script:Config.refreshSeconds)) } catch { $script:RefreshSeconds = 30 }
    }

    $script:NextAchievementCount = 3
    if ($null -ne $script:Config.nextAchievementCount) {
        try { $script:NextAchievementCount = [Math]::Max(1, [Math]::Min(5, [int]$script:Config.nextAchievementCount)) } catch { $script:NextAchievementCount = 3 }
    }

    $script:LatestAchievementCount = 3
    if ($null -ne $script:Config.latestAchievementCount) {
        try { $script:LatestAchievementCount = [Math]::Max(1, [Math]::Min(5, [int]$script:Config.latestAchievementCount)) } catch { $script:LatestAchievementCount = 3 }
    }

    $script:OverlayWidth = 480
    if ($null -ne $script:Config.overlayWidth) {
        try { $script:OverlayWidth = [Math]::Max(280, [Math]::Min(1920, [int]$script:Config.overlayWidth)) } catch { $script:OverlayWidth = 480 }
    }

    $script:OverlayHeight = 430
    if ($null -ne $script:Config.overlayHeight) {
        try { $script:OverlayHeight = [Math]::Max(200, [Math]::Min(1200, [int]$script:Config.overlayHeight)) } catch { $script:OverlayHeight = 430 }
    }

    $script:DisplayMode = ([string]$script:Config.displayMode).ToLowerInvariant()
    if ($script:DisplayMode -notin @('latest', 'next')) { $script:DisplayMode = 'latest' }
}

Set-TrackerRuntimeConfig -Configuration $script:Config

$script:RecentGames = $null
$script:RecentGamesAt = [DateTime]::MinValue
$script:CachedGameId = 0
$script:CachedGame = $null
$script:CachedGameAt = [DateTime]::MinValue

function Get-RetroApiErrorDetail {
    param([Parameter(Mandatory = $true)]$ErrorRecord)

    $parts = @()
    if ($null -ne $ErrorRecord.ErrorDetails -and -not [string]::IsNullOrWhiteSpace([string]$ErrorRecord.ErrorDetails.Message)) {
        $parts += [string]$ErrorRecord.ErrorDetails.Message
    }

    $exception = $ErrorRecord.Exception
    $response = $null
    while ($null -ne $exception -and $null -eq $response) {
        if ($exception -is [System.Net.WebException]) {
            $response = $exception.Response
        } elseif ($exception.PSObject.Properties.Match('Response').Count -gt 0) {
            $response = $exception.Response
        }
        if ($null -eq $response) { $exception = $exception.InnerException }
    }

    if ($null -ne $response) {
        try {
            if ($null -ne $response.StatusCode) {
                $parts += ('HTTP status: {0} ({1})' -f [int]$response.StatusCode, [string]$response.StatusCode)
            }
        } catch { }
        try {
            $stream = $response.GetResponseStream()
            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
                if (-not [string]::IsNullOrWhiteSpace($body)) {
                    if ($body.Length -gt 1600) { $body = $body.Substring(0, 1600) + '…' }
                    $parts += ('Response body: ' + $body)
                }
            }
        } catch { }
    }

    if ($parts.Count -gt 0) { return ($parts -join ' | ') }
    return [string]$ErrorRecord.Exception.Message
}

function Invoke-RetroAchievementsApi {
    param(
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)][hashtable]$Parameters
    )

    $allParameters = @{
        y = [string]$script:Config.apiKey
        u = [string]$script:Config.username
    }
    foreach ($key in $Parameters.Keys) {
        $allParameters[$key] = [string]$Parameters[$key]
    }

    $queryParts = foreach ($key in $allParameters.Keys) {
        '{0}={1}' -f [Uri]::EscapeDataString([string]$key), [Uri]::EscapeDataString([string]$allParameters[$key])
    }
    $uri = 'https://retroachievements.org/API/{0}?{1}' -f $Endpoint, ($queryParts -join '&')
    try {
        return Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 20 -Headers @{ 'User-Agent' = 'RA-OBS-Tracker/2.5' }
    } catch {
        $detail = Get-RetroApiErrorDetail -ErrorRecord $_
        throw ('RetroAchievements API v1 endpoint {0} failed: {1}' -f $Endpoint, $detail)
    }
}

function Invoke-RetroAchievementsV2 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $uri = 'https://api.retroachievements.org/v2/{0}' -f $Path.TrimStart('/')
    try {
        return Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 20 -Headers @{
            'X-API-Key' = [string]$script:Config.apiKey
            'Accept' = 'application/vnd.api+json'
            'User-Agent' = 'RA-OBS-Tracker/2.5'
        }
    } catch {
        $detail = Get-RetroApiErrorDetail -ErrorRecord $_
        # Never include the API key in diagnostics. The path contains only the username and set IDs.
        throw ('RetroAchievements API v2 request /v2/{0} failed: {1}' -f $Path.TrimStart('/'), $detail)
    }
}

function Get-RetroAchievementsV2Collection {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$PageSize = 100
    )

    $pageNumber = 1
    $allItems = New-Object 'System.Collections.Generic.List[object]'
    while ($true) {
        $separator = if ($Path.Contains('?')) { '&' } else { '?' }
        $pagePath = '{0}{1}page%5Bsize%5D={2}&page%5Bnumber%5D={3}' -f $Path, $separator, $PageSize, $pageNumber
        $pageResponse = Invoke-RetroAchievementsV2 -Path $pagePath
        if ($null -eq $pageResponse.data) {
            $pageItems = @()
        } else {
            $pageItems = @($pageResponse.data)
        }

        foreach ($item in $pageItems) { $allItems.Add($item) }

        $lastPage = 0
        try { $lastPage = [int]$pageResponse.meta.page.lastPage } catch { $lastPage = 0 }
        if ($lastPage -gt 0) {
            if ($pageNumber -ge $lastPage) { break }
        } elseif ($pageItems.Count -lt $PageSize) {
            break
        }

        $pageNumber++
        if ($pageNumber -gt 100) {
            throw "RetroAchievements pagination exceeded 100 pages for /v2/$Path."
        }
    }

    return $allItems.ToArray()
}

function Get-SubsetGameData {
    param(
        [Parameter(Mandatory = $true)][int]$GameId,
        [Parameter(Mandatory = $true)][int]$AchievementSetId
    )

    # V1 remains useful for the parent game's display title and console metadata.
    if ($script:CachedGameId -ne $GameId -or $null -eq $script:CachedGame -or
        ((Get-Date) - $script:CachedGameAt).TotalSeconds -ge 25) {
        $script:CachedGame = Invoke-RetroAchievementsApi -Endpoint 'API_GetGameInfoAndUserProgress.php' -Parameters @{ g = $GameId }
        $script:CachedGameId = $GameId
        $script:CachedGameAt = Get-Date
    }
    $parentGame = $script:CachedGame

    # V2 models subsets as Achievement Sets and exposes progress per set.
    $setResponse = Invoke-RetroAchievementsV2 -Path "achievement-sets/$AchievementSetId"
    $setData = $setResponse.data
    if ($null -eq $setData -or [string]$setData.id -ne [string]$AchievementSetId) {
        throw "RetroAchievements did not return achievement set $AchievementSetId."
    }
    $setAttributes = $setData.attributes

    $encodedUser = [Uri]::EscapeDataString([string]$script:Config.username)
    $encodedSetId = [Uri]::EscapeDataString([string]$AchievementSetId)
    $progressPath = "users/$encodedUser/player-achievement-sets?filter%5BachievementSetId%5D=$encodedSetId&page%5Bsize%5D=10"
    $progressResponse = Invoke-RetroAchievementsV2 -Path $progressPath
    # The request is already filtered to this set; its first result is the set progress row.
    $progressRecord = @($progressResponse.data) | Select-Object -First 1
    $progressAttributes = if ($null -ne $progressRecord) { $progressRecord.attributes } else { $null }

    # V1 does not model modern subsets. V2's achievements collection can be
    # filtered by the parent game and includes each achievement's set relationship.
    # Filter that collection locally to the requested set, then overlay the user's
    # unlock dates from the set-specific player-achievements relationship.
    $encodedGameId = [Uri]::EscapeDataString([string]$GameId)
    $definitionsPath = "achievements?filter%5BgameId%5D=$encodedGameId&include=achievementSet&sort=orderColumn"
    $definitionRecords = @(Get-RetroAchievementsV2Collection -Path $definitionsPath -PageSize 100)

    $achievementMap = [ordered]@{}
    foreach ($achievementResource in $definitionRecords) {
        $setRelationship = $achievementResource.relationships.achievementSet.data
        if ($null -eq $setRelationship -or [string]$setRelationship.id -ne [string]$AchievementSetId) { continue }

        $achievementId = [string]$achievementResource.id
        $achievementAttributes = $achievementResource.attributes
        # badgeUrl is the colored/unlocked artwork. Prefer it over badgeLockedUrl.
        # If only a locked URL is present, strip the _lock suffix to request the
        # matching colored badge instead (e.g. 744502_lock.png -> 744502.png).
        $badgeUrl = [string]$achievementAttributes.badgeUrl
        if ([string]::IsNullOrWhiteSpace($badgeUrl)) { $badgeUrl = [string]$achievementAttributes.badgeLockedUrl }
        $badgeUrl = $badgeUrl -replace '(?i)_lock(?=\.[a-z0-9]+(?:[?#].*)?$)', ''
        if ($badgeUrl.StartsWith('/')) { $badgeUrl = 'https://retroachievements.org' + $badgeUrl }

        $achievementMap[$achievementId] = [ordered]@{
            ID = [int]$achievementResource.id
            Title = [string]$achievementAttributes.title
            Points = [int]$achievementAttributes.points
            Description = [string]$achievementAttributes.description
            BadgeName = ''
            BadgeUrl = $badgeUrl
            DisplayOrder = [int]$achievementAttributes.orderColumn
            DateEarned = ''
            DateEarnedHardcore = ''
        }
    }

    if ($achievementMap.Count -eq 0) {
        throw "No achievement definitions were returned for achievement set $AchievementSetId on game $GameId."
    }

    $unlockPath = "users/$encodedUser/player-achievements?filter%5BachievementSetId%5D=$encodedSetId&sort=-unlockedAt"
    $unlockRecords = @(Get-RetroAchievementsV2Collection -Path $unlockPath -PageSize 100)
    foreach ($unlock in $unlockRecords) {
        $achievementRelation = $unlock.relationships.achievement.data
        if ($null -eq $achievementRelation) { continue }
        $achievementId = [string]$achievementRelation.id
        if (-not $achievementMap.Contains($achievementId)) { continue }

        $unlockAttributes = $unlock.attributes
        $achievementMap[$achievementId]['DateEarned'] = [string]$unlockAttributes.unlockedAt
        $achievementMap[$achievementId]['DateEarnedHardcore'] = [string]$unlockAttributes.unlockedHardcoreAt
    }

    $totalAchievements = 0
    if ($null -ne $setAttributes.achievementsPublished) {
        $totalAchievements = [int]$setAttributes.achievementsPublished
    } else {
        $totalAchievements = $achievementMap.Count
    }

    $earnedSoftcore = 0
    $earnedHardcore = 0
    if ($null -ne $progressAttributes) {
        if ($null -ne $progressAttributes.achievementsUnlocked) { $earnedSoftcore = [int]$progressAttributes.achievementsUnlocked }
        if ($null -ne $progressAttributes.achievementsUnlockedHardcore) { $earnedHardcore = [int]$progressAttributes.achievementsUnlockedHardcore }
    } else {
        foreach ($achievement in $achievementMap.Values) {
            if (-not [string]::IsNullOrWhiteSpace([string]$achievement.DateEarned)) { $earnedSoftcore++ }
            if (-not [string]::IsNullOrWhiteSpace([string]$achievement.DateEarnedHardcore)) { $earnedHardcore++ }
        }
    }

    # Use the selected subset's icon when available; otherwise use the parent game's icon.
    # ImageIcon from the v1 endpoint is a site-relative path such as /Images/026368.png.
    $parentImageIcon = [string]$parentGame.ImageIcon
    $setImageIcon = [string]$setAttributes.badgeUrl
    if ([string]::IsNullOrWhiteSpace($setImageIcon)) { $setImageIcon = $parentImageIcon }

    $subsetGame = [ordered]@{
        ID = $GameId
        Title = [string]$parentGame.Title
        ConsoleName = [string]$parentGame.ConsoleName
        ImageIcon = $setImageIcon
        ParentImageIcon = $parentImageIcon
        NumAchievements = $totalAchievements
        NumAwardedToUser = $earnedSoftcore
        NumAwardedToUserHardcore = $earnedHardcore
        Achievements = $achievementMap
        AchievementSetTitle = [string]$setAttributes.title
    }

    return [ordered]@{
        game = $subsetGame
        mode = $script:Mode
        refreshSeconds = $script:RefreshSeconds
        nextAchievementCount = $script:NextAchievementCount
        latestAchievementCount = $script:LatestAchievementCount
        displayMode = $script:DisplayMode
        aesthetics = $script:Aesthetics
        updatedAt = (Get-Date).ToString('o')
    }
}

function Get-CurrentGameData {
    if ([string]::IsNullOrWhiteSpace([string]$script:Config.username) -or
        [string]::IsNullOrWhiteSpace([string]$script:Config.apiKey)) {
        throw 'Open Tracker Settings and enter your RetroAchievements username and Web API key.'
    }
    $fixedSetId = [string]$script:Config.fixedAchievementSetId
    if (-not [string]::IsNullOrWhiteSpace($fixedSetId)) {
        $gameIdForSet = 0
        $achievementSetId = 0
        if (-not [int]::TryParse([string]$script:Config.fixedGameId, [ref]$gameIdForSet) -or $gameIdForSet -le 0) {
            throw 'fixedGameId must contain the parent game ID when fixedAchievementSetId is used.'
        }
        if (-not [int]::TryParse($fixedSetId, [ref]$achievementSetId) -or $achievementSetId -le 0) {
            throw 'fixedAchievementSetId must be blank or a positive achievement-set ID.'
        }
        return Get-SubsetGameData -GameId $gameIdForSet -AchievementSetId $achievementSetId
    }

    $fixedId = [string]$script:Config.fixedGameId
    if (-not [string]::IsNullOrWhiteSpace($fixedId)) {
        $gameId = 0
        if (-not [int]::TryParse($fixedId, [ref]$gameId) -or $gameId -le 0) {
            throw 'fixedGameId must be blank or a positive game ID.'
        }
    } else {
        if ($null -eq $script:RecentGames -or ((Get-Date) - $script:RecentGamesAt).TotalSeconds -ge 25) {
            $script:RecentGames = @(Invoke-RetroAchievementsApi -Endpoint 'API_GetUserRecentlyPlayedGames.php' -Parameters @{ c = 1 })
            $script:RecentGamesAt = Get-Date
        }
        if ($script:RecentGames.Count -eq 0) {
            throw 'No recently played games were found for this account.'
        }
        $gameId = [int]$script:RecentGames[0].GameID
    }

    if ($script:CachedGameId -ne $gameId -or $null -eq $script:CachedGame -or
        ((Get-Date) - $script:CachedGameAt).TotalSeconds -ge 25) {
        $script:CachedGame = Invoke-RetroAchievementsApi -Endpoint 'API_GetGameInfoAndUserProgress.php' -Parameters @{ g = $gameId }
        $script:CachedGameId = $gameId
        $script:CachedGameAt = Get-Date
    }

    return [ordered]@{
        game = $script:CachedGame
        mode = $script:Mode
        refreshSeconds = $script:RefreshSeconds
        nextAchievementCount = $script:NextAchievementCount
        latestAchievementCount = $script:LatestAchievementCount
        displayMode = $script:DisplayMode
        aesthetics = $script:Aesthetics
        updatedAt = (Get-Date).ToString('o')
    }
}

function Send-Bytes {
    param(
        [Parameter(Mandatory = $true)]$Response,
        [Parameter(Mandatory = $true)][int]$StatusCode,
        [Parameter(Mandatory = $true)][string]$ContentType,
        [Parameter(Mandatory = $true)][byte[]]$Bytes
    )

    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentEncoding = [Text.Encoding]::UTF8
    $Response.Headers['Cache-Control'] = 'no-store'
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Response.Close()
}

function Send-Json {
    param($Response, [int]$StatusCode, $Object)
    $json = ConvertTo-Json -InputObject $Object -Depth 30 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    Send-Bytes -Response $Response -StatusCode $StatusCode -ContentType 'application/json; charset=utf-8' -Bytes $bytes
}

function Get-ContentType {
    param([string]$Path)
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.js'   { return 'application/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.png'  { return 'image/png' }
        '.svg'  { return 'image/svg+xml' }
        '.ico'  { return 'image/x-icon' }
        default { return 'application/octet-stream' }
    }
}


function Get-PublicConfig {
    return [ordered]@{
        username = [string]$script:Config.username
        hasApiKey = -not [string]::IsNullOrWhiteSpace([string]$script:Config.apiKey)
        fixedGameId = [string]$script:Config.fixedGameId
        fixedAchievementSetId = [string]$script:Config.fixedAchievementSetId
        achievementMode = $script:Mode
        refreshSeconds = $script:RefreshSeconds
        nextAchievementCount = $script:NextAchievementCount
        latestAchievementCount = $script:LatestAchievementCount
        overlayWidth = $script:OverlayWidth
        overlayHeight = $script:OverlayHeight
        displayMode = $script:DisplayMode
        aesthetics = $script:Aesthetics
        configRevision = $script:ConfigRevision
    }
}

function Save-TrackerConfigFromRequest {
    param([Parameter(Mandatory = $true)]$Request)

    $reader = [System.IO.StreamReader]::new($Request.InputStream, [System.Text.Encoding]::UTF8)
    try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ([string]::IsNullOrWhiteSpace($body)) { throw 'The settings request was empty.' }
    $incoming = $body | ConvertFrom-Json -ErrorAction Stop

    $username = ([string]$incoming.username).Trim()
    if ([string]::IsNullOrWhiteSpace($username)) { throw 'Enter your RetroAchievements username.' }

    # A blank key field means keep the existing key; the key is never returned to the browser.
    $apiKey = ([string]$incoming.apiKey).Trim()
    if ([string]::IsNullOrWhiteSpace($apiKey)) { $apiKey = [string]$script:Config.apiKey }
    if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'Enter your RetroAchievements Web API key.' }

    $fixedGameId = ([string]$incoming.fixedGameId).Trim()
    $fixedSetId = ([string]$incoming.fixedAchievementSetId).Trim()
    if (-not [string]::IsNullOrWhiteSpace($fixedGameId)) {
        $parsedGameId = 0
        if (-not [int]::TryParse($fixedGameId, [ref]$parsedGameId) -or $parsedGameId -le 0) {
            throw 'The game ID must be a positive number.'
        }
        $fixedGameId = [string]$parsedGameId
    }
    if (-not [string]::IsNullOrWhiteSpace($fixedSetId)) {
        $parsedSetId = 0
        if (-not [int]::TryParse($fixedSetId, [ref]$parsedSetId) -or $parsedSetId -le 0) {
            throw 'The achievement set ID must be a positive number.'
        }
        if ([string]::IsNullOrWhiteSpace($fixedGameId)) {
            throw 'A parent game ID is required when selecting a subset.'
        }
        $fixedSetId = [string]$parsedSetId
    }

    $achievementMode = ([string]$incoming.achievementMode).ToLowerInvariant()
    if ($achievementMode -notin @('hardcore', 'softcore')) { $achievementMode = 'hardcore' }

    $displayMode = ([string]$incoming.displayMode).ToLowerInvariant()
    if ($displayMode -notin @('latest', 'next')) { $displayMode = 'latest' }

    $refreshSeconds = 30
    try { $refreshSeconds = [Math]::Max(15, [Math]::Min(300, [int]$incoming.refreshSeconds)) } catch { $refreshSeconds = 30 }

    $nextCount = 3
    try { $nextCount = [Math]::Max(1, [Math]::Min(5, [int]$incoming.nextAchievementCount)) } catch { $nextCount = 3 }

    $latestCount = 3
    try { $latestCount = [Math]::Max(1, [Math]::Min(5, [int]$incoming.latestAchievementCount)) } catch { $latestCount = 3 }

    $overlayWidth = 480
    if ($null -ne $incoming.overlayWidth) {
        try { $overlayWidth = [Math]::Max(280, [Math]::Min(1920, [int]$incoming.overlayWidth)) } catch { $overlayWidth = 480 }
    }

    $overlayHeight = 430
    if ($null -ne $incoming.overlayHeight) {
        try { $overlayHeight = [Math]::Max(200, [Math]::Min(1200, [int]$incoming.overlayHeight)) } catch { $overlayHeight = 430 }
    }

    $aesthetics = Get-NormalizedAesthetics -InputAesthetics $incoming.aesthetics

    $newConfig = [pscustomobject][ordered]@{
        username = $username
        apiKey = $apiKey
        fixedGameId = $fixedGameId
        fixedAchievementSetId = $fixedSetId
        achievementMode = $achievementMode
        refreshSeconds = $refreshSeconds
        nextAchievementCount = $nextCount
        latestAchievementCount = $latestCount
        overlayWidth = $overlayWidth
        overlayHeight = $overlayHeight
        displayMode = $displayMode
        aesthetics = $aesthetics
    }

    $json = ConvertTo-Json -InputObject $newConfig -Depth 8
    $tempPath = "$ConfigPath.tmp"
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($tempPath, $json, $encoding)
    Move-Item -LiteralPath $tempPath -Destination $ConfigPath -Force

    Set-TrackerRuntimeConfig -Configuration $newConfig
    $script:RecentGames = $null
    $script:RecentGamesAt = [DateTime]::MinValue
    $script:CachedGameId = 0
    $script:CachedGame = $null
    $script:CachedGameAt = [DateTime]::MinValue

    return Get-PublicConfig
}

$Listener = [System.Net.HttpListener]::new()
$Listener.Prefixes.Add($Prefix)
try {
    $Listener.Start()
} catch {
    Write-Host "Could not start the local overlay server at $Prefix" -ForegroundColor Red
    Write-Host 'The port may already be in use. Close the other process and try again.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host ''
Write-Host 'RetroAchievements OBS Tracker Studio is running.' -ForegroundColor Green
Write-Host "Settings page: ${Prefix}settings" -ForegroundColor Cyan
Write-Host "OBS Browser Source: $Prefix" -ForegroundColor Cyan
Write-Host 'Keep this window open while streaming. Press Ctrl+C to stop the server.'
Write-Host ''

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response
        try {
            $Path = [Uri]::UnescapeDataString($Request.Url.AbsolutePath)

            if ($Path -eq '/api/config') {
                if ($Request.HttpMethod -eq 'GET') {
                    Send-Json -Response $Response -StatusCode 200 -Object (Get-PublicConfig)
                } elseif ($Request.HttpMethod -eq 'POST') {
                    try {
                        $publicConfig = Save-TrackerConfigFromRequest -Request $Request
                        Send-Json -Response $Response -StatusCode 200 -Object ([ordered]@{ saved = $true; config = $publicConfig })
                    } catch {
                        Send-Json -Response $Response -StatusCode 400 -Object ([ordered]@{ error = [string]$_.Exception.Message })
                    }
                } else {
                    Send-Json -Response $Response -StatusCode 405 -Object ([ordered]@{ error = 'Method not allowed.' })
                }
            } elseif ($Path -eq '/api/data') {
                try {
                    $payload = Get-CurrentGameData
                    Send-Json -Response $Response -StatusCode 200 -Object $payload
                } catch {
                    $apiError = [string]$_.Exception.Message
                    Write-Host ("[{0}] API error: {1}" -f (Get-Date -Format 'HH:mm:ss'), $apiError) -ForegroundColor Yellow
                    Send-Json -Response $Response -StatusCode 502 -Object ([ordered]@{
                        error = $apiError
                    })
                }
            } else {
                $relative = if ($Path -eq '/' -or $Path -eq '/index.html') { 'index.html' } elseif ($Path -eq '/settings' -or $Path -eq '/settings/') { 'settings.html' } else { $Path.TrimStart('/') }
                $relative = $relative.Replace('/', [IO.Path]::DirectorySeparatorChar)
                $fullPath = [IO.Path]::GetFullPath((Join-Path $Root $relative))
                $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

                if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
                    -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                    $notFound = [Text.Encoding]::UTF8.GetBytes('Not found')
                    Send-Bytes -Response $Response -StatusCode 404 -ContentType 'text/plain; charset=utf-8' -Bytes $notFound
                } else {
                    $bytes = [IO.File]::ReadAllBytes($fullPath)
                    Send-Bytes -Response $Response -StatusCode 200 -ContentType (Get-ContentType $fullPath) -Bytes $bytes
                }
            }
        } catch {
            try {
                $message = [Text.Encoding]::UTF8.GetBytes('Server error')
                Send-Bytes -Response $Response -StatusCode 500 -ContentType 'text/plain; charset=utf-8' -Bytes $message
            } catch { }
        }
    }
} finally {
    $Listener.Stop()
    $Listener.Close()
}
