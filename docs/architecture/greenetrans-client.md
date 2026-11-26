# 黄区向红区传送文件（GreeneTransClient）

在黄区 Windows 电脑上，按当前使用的终端选择一条命令执行。下面的示例发送当前用户下载目录中的 `agent-程序编排实践分享.pptx`。发送其他文件时，替换 `-r` 后面的路径。

## PowerShell

用 `&` 调用带空格的程序路径，整条命令写在一行。PowerShell 不支持用 `^` 续行。

```powershell
& "C:\Program Files (x86)\GreeneTransClient\GreeneTransClientTool.exe" -r "$env:USERPROFILE\Downloads\agent-程序编排实践分享.pptx" -h
```

## cmd.exe

在命令提示符中直接执行这一行，无需添加续行符 `^`。

```bat
"C:\Program Files (x86)\GreeneTransClient\GreeneTransClientTool.exe" -r "%USERPROFILE%\Downloads\agent-程序编排实践分享.pptx" -h
```

## 确认传输完成

`-h` 只隐藏弹窗。命令返回后，文件可能仍在后台传输。在 PowerShell 中读取最近 20 行日志。

```powershell
Get-Content "$env:APPDATA\GreeneTrans\log.txt" -Tail 20
```

找到本次传输对应文件名的 `STOR` 记录，再核对随后的响应。出现以下记录表示该文件传输成功。

```text
命令: STOR agent-程序编排实践分享.pptx
响应: 226 Transfer complete.
```
