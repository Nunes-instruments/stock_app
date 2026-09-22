Option Explicit
Dim shell, fso, scriptDir, appDir, ps1, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.GetParentFolderName(scriptDir)
ps1 = scriptDir & "\update_main_server.ps1"
cmd = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """"
shell.Run cmd, 0, False
