# Registers the agent to start automatically when you log in to Windows.
# The agent then stays running: Telegram bot + a check every hour.
# Run: powershell -ExecutionPolicy Bypass -File .\install-hourly-task.ps1
$dir  = $PSScriptRoot
$node = (Get-Command node).Source
Unregister-ScheduledTask -TaskName "TicketSeatAgent" -Confirm:$false -ErrorAction SilentlyContinue
$action   = New-ScheduledTaskAction -Execute $node -Argument "src\agent.js" -WorkingDirectory $dir
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "TicketSeatAgent" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "TicketSeatAgent"
Write-Host "Agent registered: starts at every login and is running now."
Write-Host "To remove: Unregister-ScheduledTask -TaskName TicketSeatAgent"
