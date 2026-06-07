# Codex File Tool

适用于 Codex CLI 的文件操作工具集，配合 AI Agent 安全可靠地读写代码文件。

## 为什么需要它？

Codex 在 Windows 上的 Shell 是 PowerShell，而 PowerShell 处理代码文件有严重缺陷：

- `$` 被解释为变量 -- Dart/JS 里的 `$variable` / `${expr}` 被吃掉
- `@'...'@` here-string -- 编码损坏
- `Set-Content` -- 默认 UTF-16 LE
- `echo | node _tool.js` -- 管道传参同样被破坏

_tool.js 和 SKILL.md 彻底绕开 PowerShell，所有内容通过临时文件传递。

## 安装

```powershell
mkdir -Force "$env:USERPROFILE\.codex\tools"
copy _tool.js "$env:USERPROFILE\.codex\tools\"
mkdir -Force "$env:USERPROFILE\.codex\skills\use-codex-tool"
copy SKILL.md "$env:USERPROFILE\.codex\skills\use-codex-tool\"
```

## 统一 replace 命令（v2）

一个命令覆盖所有场景：

| 场景 | 命令 |
|------|------|
| 字符串替换 | `replace <f> --find "old" --with "new"` |
| 行范围替换 | `replace <f> --from 10 --to 15 --with-file <tmp>` |
| 行范围删除 | `replace <f> --from 10 --to 15` |
| 批量替换 | `replace <f> --patch-file <tmp>` (FIND\n---\nREPLACE, === 分隔) |

所有写入自动备份。加 `--dry-run` 预览。

## 关键规则

1. **NEVER** use PowerShell for file content
2. **NEVER** use stdin pipes to _tool.js
3. **ALWAYS** use --with-file when content contains `$`
4. PowerShell ONLY for system commands and flutter/git/rg

## License

MIT