# Install: daemon auto-starts at Windows login + "GoHub Agent" Desktop shortcut to start it manually.
# Uninstall: .\install-autostart.ps1 -Uninstall
param([switch]$Uninstall)
$vbs = Join-Path $PSScriptRoot "start-hidden.vbs"
$targets = @(
  (Join-Path ([Environment]::GetFolderPath("Startup")) "GoHub Agent.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "GoHub Agent.lnk")
)
foreach ($lnk in $targets) {
  if ($Uninstall) { if (Test-Path $lnk) { Remove-Item $lnk -Confirm:$false }; continue }
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = "wscript.exe"
  $s.Arguments = "`"$vbs`""
  $s.WorkingDirectory = $PSScriptRoot
  $s.Description = "GoHub local agent (Gau Pro localFiles)"
  $s.Save()
}
if ($Uninstall) { "Removed autostart + shortcut." } else { "Installed: $($targets -join ', ')" }
