---
name: use-codex-tool
description: |
  **MANDATORY** — 当需要对工作区文件进行读取、修改、写入、替换、删除等文件操作时，必须使用以下方式：
  1. `node "%USERPROFILE%\.codex\tools\_tool.js" <command>` 通过 exec_command 调用
  2. `mcp__node_repl__js` 使用 fs.readFileSync / fs.writeFileSync
  
  **NEVER** use PowerShell for file content modification. **NEVER** use stdin pipes to _tool.js.
  Supported commands: read, write, info, revert, replace, insert-at, mkdir, ls, search, clean-backups
---

# 文件操作工具使用规则

## 核心禁令

**NEVER** use these PowerShell patterns for file content:

- **NEVER** `Set-Content` / `Out-File` — encoding corruption
- **NEVER** `$content.Replace(...)` then `Set-Content` — eats `$` characters
- **NEVER** `echo "..." | node _tool.js` — stdin breaks in PowerShell
- **NEVER** pass `$` in arguments to `_tool.js replace-str` — PowerShell interprets them as variables

**ALWAYS** use one of these two methods:

### Method 1: _tool.js (preferred for simple operations)

```
node "%USERPROFILE%\.codex\tools\_tool.js" read <file> [from] [to]
node "%USERPROFILE%\.codex\tools\_tool.js" replace <file> --find <str> --with <str>
node "%USERPROFILE%\.codex\tools\_tool.js" replace <file> --from <n> --to <n> [--with-file <tmp>]
node "%USERPROFILE%\.codex\tools\_tool.js" replace <file> --patch-file <tmp>
node "%USERPROFILE%\.codex\tools\_tool.js" search <pattern> [dir] [glob]
node "%USERPROFILE%\.codex\tools\_tool.js" clean-backups [--keep <n>]
```

**CRITICAL**: If the replacement text contains `$`, `{`, `}`, or any Dart interpolation, **do NOT use --find/--with**. Instead write the content to a temp file via Method 2, then use `--with-file` or `--patch-file`.

### Method 2: mcp__node_repl__js (required for content with `$`)

```javascript
var fs = await import('node:fs');
// Write replacement content to temp file
fs.writeFileSync(require('node:os').tmpdir() + '/patch.txt', 'new content with $variables', 'utf8');
```

Then call:
```
node _tool.js replace <file> --from 10 --to 15 --with-file C:\Users\...\Temp\patch.txt
```

## PowerShell 仅限系统命令

PowerShell **ONLY** for:
- Windows system: `Get-ChildItem`, `Remove-Item`, `Get-Process`
- Third-party CLI: `flutter`, `git`, `gh`, `rg`
- Simple reading: `cat` (read only, no pipe redirection)

**NEVER** use PowerShell for any file content modification.
