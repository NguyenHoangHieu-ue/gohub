' Run the daemon hidden (no console window). Used by Windows autostart + Desktop shortcut.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "node """ & dir & "\daemon.mjs""", 0, False
