# Codex File Tool

适用于 [Codex CLI](https://github.com/openai/codex) 的文件操作工具集，配合 AI Agent 安全可靠地读写代码文件。

## 为什么需要它？

Codex 的 Shell 环境在 Windows 上是 **PowerShell**，而 PowerShell 在传参和写文件时有严重缺陷：

- `$` 会被解释为变量 → Dart/JS 代码里的 `$variable` / `${expr}` / record `$1` 被吃掉
- `@'...'@` here-string 写文件 → BOM、换行符混乱，编码损坏
- `Set-Content` → 默认 UTF-16 LE，代码文件变乱码

**_tool.js** 和 **SKILL.md** 解决了这些问题。

## 文件说明

| 文件 | 用途 |
|------|------|
| `_tool.js` | Node.js 脚本，提供 read / write / replace / delete-lines 等命令 |
| `SKILL.md` | Codex Skill 定义文件，声明工具使用规则和禁止项 |

## 安装

### 1. 复制工具脚本

将 `_tool.js` 放到 `%USERPROFILE%\.codex\tools\` 目录下：

```powershell
mkdir -Force "$env:USERPROFILE\.codex\tools"
copy _tool.js "$env:USERPROFILE\.codex\tools\"
```

### 2. 注册 Skill

将 `SKILL.md` 放到 `%USERPROFILE%\.codex\skills\use-codex-tool\` 目录下：

```powershell
mkdir -Force "$env:USERPROFILE\.codex\skills\use-codex-tool"
copy SKILL.md "$env:USERPROFILE\.codex\skills\use-codex-tool\"
```

重启 Codex 即可生效。

## 支持的命令

```
node "%USERPROFILE%\.codex\tools\_tool.js" read <file> [from] [to]     读取文件(可选行范围)
node "%USERPROFILE%\.codex\tools\_tool.js" write <file>                从 stdin 写入(自动备份)
node "%USERPROFILE%\.codex\tools\_tool.js" info <file>                 显示编码、换行符、大小
node "%USERPROFILE%\.codex\tools\_tool.js" revert <file>               从备份或 git 恢复
node "%USERPROFILE%\.codex\tools\_tool.js" replace <file>              stdin: FIND\n---\nREPLACE
node "%USERPROFILE%\.codex\tools\_tool.js" replace-str <file> <f> <r>  字符串直接替换
node "%USERPROFILE%\.codex\tools\_tool.js" replace-block <file>        stdin: ---marker\n<marker>\n---body\n<replacement>
node "%USERPROFILE%\.codex\tools\_tool.js" replace-all <file>          stdin: 批量，=== 分隔
node "%USERPROFILE%\.codex\tools\_tool.js" replace-lines <file> <f> <t> 替换行范围(1-based)，stdin=新内容
node "%USERPROFILE%\.codex\tools\_tool.js" insert-at <file> <line>     在行前插入(stdin)
node "%USERPROFILE%\.codex\tools\_tool.js" delete-lines <file> <f> <t> 删除行范围
node "%USERPROFILE%\.codex\tools\_tool.js" mkdir <dir>                 创建目录
node "%USERPROFILE%\.codex\tools\_tool.js" ls [dir]                    列出目录
node "%USERPROFILE%\.codex\tools\_tool.js" search <pattern> [dir] [g]  递归搜索(默认 . *.dart)
```

所有写入操作自动备份到 `%USERPROFILE%\.codex\backups\`。

## 适用场景 vs 不适用场景

### ✅ 适用：文件内容修改

```bash
# 精确替换字符串
node _tool.js replace-str "src/app.dart" "oldFunc()" "newFunc()"

# 按行号替换
echo "new code" | node _tool.js replace-lines "src/app.dart" 10 15

# 删除行
node _tool.js delete-lines "src/config.dart" 5 8
```

### ✅ 适用：复杂逻辑（配合 Node REPL）

当替换内容包含 `$` `{` `}` 等特殊字符时，必须用 `mcp__node_repl__js`：

```javascript
// 在 Codex 的 mcp__node_repl__js 中执行
var fs = await import('node:fs');
var content = fs.readFileSync('src/app.dart', 'utf8');
content = content.replace('old', 'new_with_${variable}');
fs.writeFileSync('src/app.dart', content, 'utf8');
```

### ❌ 不适用：系统管理

以下操作直接用 PowerShell，不要通过本工具：

```powershell
# 文件列表、进程管理、网络配置等
Get-ChildItem -Recurse -Filter *.dart
Get-Process | Where-Object { $_.ProcessName -like '*dart*' }
```

## 核心规则

1. **修改文件内容** → 只能用 `_tool.js` 或 `mcp__node_repl__js`
2. **含特殊字符** → 只用 `mcp__node_repl__js`，不走 PowerShell 传参
3. **Windows 系统命令** → 用 PowerShell（文件操作除外）
4. **第三方 CLI** → `flutter` / `git` / `gh` / `rg` 走 PowerShell 没问题

## License

MIT
