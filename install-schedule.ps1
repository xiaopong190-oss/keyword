$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmd = Join-Path $root 'run-collection.cmd'
$action = New-ScheduledTaskAction -Execute $cmd -WorkingDirectory $root
$triggers = @((New-ScheduledTaskTrigger -Daily -At '09:00'),(New-ScheduledTaskTrigger -Daily -At '21:00'))
Register-ScheduledTask -TaskName 'ASIN Radar Collection' -Action $action -Trigger $triggers -Description 'Collect Amazon ASIN data twice daily' -Force
