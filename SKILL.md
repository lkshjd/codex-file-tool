---
name: use-codex-tool
description: |
  **MANDATORY** — 当需要对工作区文件进行读取、修改、写入、替换、删除等文件操作时，必须使用以下两种方式之一：
  1. `node "C:\Users\lihe\.codex\tools\_tool.js" <command>` 通过 exec_command 调用
  2. `mcp__node_repl__js` 使用 fs.readFileSync / fs.writeFileSync
  
  严禁使用 PowerShell here-strings (@'...'@) 或 cmd 重定向来构造文件内容，这会导致编码损坏。
  
  支持的命令: read, write, replace, replace-all, replace-lines, delete-lines, insert-at, mkdir, ls, search
---

# 文件操作工具使用规则

## 规则
对所有工作区文件的修改操作，必须使用以下两种方式之一，**严禁**使用 PowerShell here-strings 或 cmd 管道直接写入文件内容。

### 方式 1: _tool.js (推荐)
```
node "C:\Users\lihe\.codex\tools\_tool.js" read <file> [from] [to]      读文件/行范围
node "C:\Users\lihe\.codex\tools\_tool.js" search <pattern> [dir] [glob]  递归搜索(默认 . *.dart)
node "C:\Users\lihe\.codex\tools\_tool.js" replace-str <file> <find> <rep> 直接替换(免stdin)
node "C:\Users\lihe\.codex\tools\_tool.js" replace <file>  (stdin: FIND\n---\nREPLACE)
node "C:\Users\lihe\.codex\tools\_tool.js" replace-all <file> (stdin: 批量，=== 分隔)
node "C:\Users\lihe\.codex\tools\_tool.js" replace-lines <file> <from> <to> (stdin: 新内容)
node "C:\Users\lihe\.codex\tools\_tool.js" delete-lines <file> <from> <to>
```

### 方式 2: mcp__node_repl__js (推荐用于复杂逻辑)
使用 JavaScript 的 fs.readFileSync / fs.writeFileSync 进行文件操作。

## 理由
PowerShell here-strings 在处理 Dart/代码文件时频繁导致编码损坏和内容截断。

## 额外规则：PowerShell 仅限系统命令

PowerShell **只能**用于以下场景：
- Windows 系统操作：`Get-ChildItem`、`Remove-Item`、`Get-Process` 等
- 第三方命令行工具：`flutter`、`git`、`rg` 等
- 简单查看：`cat`（仅读取，不做管道重定向）

**禁止**使用 PowerShell 做任何文件内容修改，包括：
- 禁止 `Set-Content` / `Out-File` 写文件
- 禁止 `$content.Replace(...)` 修改后回写
- 禁止在 `node _tool.js replace-str <file> <find> <replace>` 的参数中包含 `$` —— PowerShell 会将其解释为变量，导致参数值截断或清空

**正确做法：**
- 文件内容修改 → 必须用 `_tool.js` 或 `mcp__node_repl__js`
- 若替换内容含 `$` / `{` / `}` 等特殊字符 → 只用 `mcp__node_repl__js`，绕过 PowerShell 传参
