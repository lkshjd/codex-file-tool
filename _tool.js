const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const HOME = os.homedir();
const BACKUP_DIR = path.join(HOME, ".codex", "backups");

// ---- helpers ----

function key(filePath) {
  return path.resolve(filePath).replace(/[\\/:]/g, "_").replace(/^_+/, "");
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return;
  const k = key(filePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, k + "_" + stamp);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(filePath, dest);
  return dest;
}

function latestBackup(filePath) {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const k = key(filePath);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(k + "_")).sort().reverse();
  return files.length > 0 ? path.join(BACKUP_DIR, files[0]) : null;
}

function stripBOM(s) {
  while (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
}

function readFileUTF8(p) {
  return stripBOM(fs.readFileSync(p, "utf-8"));
}

function readFileLF(p) {
  return readFileUTF8(p).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}


function findMatchingBrace(content, openBracePos) {
  let brace = 1;
  for (let i = openBracePos + 1; i < content.length; i++) {
    if (content[i] === "{") brace++;
    else if (content[i] === "}") {
      brace--;
      if (brace === 0) return i;
    }
  }
  return -1;
}

function skipPastBrace(content, closeBracePos) {
  let i = closeBracePos + 1;
  while (i < content.length && content[i] === " ") i++;
  if (i < content.length && content[i] === "\r") i++;
  if (i < content.length && content[i] === "\n") i++;
  return i;
}

// Show find-string and file context when replace fails
function findContext(content, findStr) {
  const idx = content.indexOf(findStr);
  if (idx >= 0) return null;
  const firstLine = findStr.split("\n")[0];
  const pos = content.indexOf(firstLine);
  if (pos < 0) {
    return "  find not in file. Find hex(40): " + hexSnippet(findStr, 40) + "\n" +
           "  file hex(40): " + hexSnippet(content, 40);
  }
  // Show hex diff around the mismatch area
  const ctx = content.substring(Math.max(0, pos - 10), Math.min(content.length, pos + firstLine.length + 60));
  return "  partial match found. File context hex: " + hexSnippet(ctx, 80) + "\n" +
         "  Find context hex:          " + hexSnippet(findStr, 80) + "\n" +
         "  (check CR/LF, tab vs space, full-width chars)";
}

function hexSnippet(s, maxLen) {
  const sub = s.substring(0, maxLen);
  return sub.replace(/[\x00-\x1f\x7f-\xff]/g, c =>
    c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : "\\x" + c.charCodeAt(0).toString(16).padStart(2,"0")
  );
}

// Simple line-diff for --dry-run
function showDiff(oldStr, newStr) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = i < oldLines.length ? oldLines[i] : null;
    const n = i < newLines.length ? newLines[i] : null;
    if (o === n) continue;
    if (o !== null) console.log("- " + o);
    if (n !== null) console.log("+ " + n);
  }
}

// ---- args ----

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes("--dry-run");
const args = rawArgs.filter(a => a !== "--dry-run");
const cmd = args[0];

function usage() {
  console.log("_tool.js - Codex file helper (global)");
  console.log("  read          <file> [from] [to]      read file (optional line range)");
  console.log("  write         <file>                 write file from stdin (auto-backup)");
  console.log("  info          <file>                 show encoding, line endings, size");
  console.log("  revert        <file>                 restore from backup or git");
  console.log("  replace       <file>                 stdin: FIND\\n---\\nREPLACE");
  console.log("  replace-str   <file> <find> <replace> replace string directly (no stdin)");
  console.log("  replace-block <file>                 stdin: ---marker\\n<marker>\\n---body\\n<replacement>");
  console.log("  replace-all   <file>                 stdin: batch of FIND\\n---\\nREPLACE separated by ===\\n");
  console.log("  delete-lines  <file> <from> <to>     delete lines (1-based, inclusive)");
  console.log("  replace-lines <file> <from> <to>     replace lines (1-based, inclusive), stdin = new content");
  console.log("  insert-at     <file> <line>          insert stdin content before line (1-based)");
  console.log("  mkdir         <dir>                  create directory");
  console.log("  ls            [dir]                  list directory");
  console.log("  search        <pattern> [dir] [glob]  search files recursively (default: . *.dart)");
  console.log("  Add --dry-run before <file> to preview changes without writing.");
  process.exit(1);
}

if (!cmd) usage();

// ---- stdin helpers ----

function readStdin(cb) {
  let data = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", chunk => data += chunk);
  process.stdin.on("end", () => {
    data = stripBOM(data).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    cb(data);
  });

}

// ---- switch ----

switch (cmd) {

  // ======== read ========
  case "read": {
    const f = args[1]; if (!f) usage();
    const from = parseInt(args[2]), to = parseInt(args[3]);
    if (!isNaN(from) && !isNaN(to)) {
      const content = readFileUTF8(f);
      const lines = content.split("\n");
      const fi = Math.max(0, from - 1);
      const ti = Math.min(lines.length - 1, to - 1);
      process.stdout.write(lines.slice(fi, ti + 1).join("\n"));
    } else if (!isNaN(from)) {
      const content = readFileUTF8(f);
      const lines = content.split("\n");
      process.stdout.write(lines[Math.max(0, from - 1)]);
    } else {
      process.stdout.write(readFileUTF8(f));
    }
    break;
  }

  // ======== write ========
  case "write": {
    const f = args[1]; if (!f) usage();
    readStdin(data => {
      const bak = backup(f);
      fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true });
      fs.writeFileSync(f, data, "utf-8");
      console.log("OK " + data.length + " chars -> " + f);
      if (bak) console.log("  backup: " + bak);
    });
    break;
  }

  // ======== info ========
  case "info": {
    const f = args[1]; if (!f) usage();
    const buf = fs.readFileSync(f);
    const hasBOM = buf.length > 0 && buf[0] === 0xFE && buf[1] === 0xFF;
    const content = readFileUTF8(f);
    const lines = content.split("\n");
    const hasCRLF = content.includes("\r\n");
    const hasCR = !hasCRLF && content.includes("\r");
    const lineEnding = hasCRLF ? "CRLF" : hasCR ? "CR" : "LF";
    console.log("  path      : " + path.resolve(f));
    console.log("  size      : " + buf.length + " bytes");
    console.log("  chars     : " + content.length + " chars");
    console.log("  lines     : " + lines.length);
    console.log("  BOM       : " + (hasBOM ? "yes" : "no"));
    console.log("  line-end  : " + lineEnding);
    console.log("  exists    : " + fs.existsSync(f));
    break;
  }

  // ======== revert ========
  case "revert": {
    const f = args[1]; if (!f) usage();
    const bak = latestBackup(f);
    if (bak) {
      const content = readFileUTF8(bak);
      fs.writeFileSync(f, content, "utf-8");
      console.log("REVERTED from backup: " + bak);
      break;
    }
    try {
      const cwd = process.cwd();
      cp.execSync("git checkout -- " + JSON.stringify(f), { cwd, stdio: "pipe" });
      console.log("REVERTED from git: " + f);
    } catch (e) {
      console.error("REVERT FAILED: no backup or git history");
      process.exit(1);
    }
    break;
  }

  // ======== replace ========
  case "replace": {
    const f = args[1]; if (!f) usage();
    readStdin(data => {
      const sep = "\n---\n";
      const sepIdx = data.indexOf(sep);
      if (sepIdx < 0) {
        console.error("REPLACE: stdin must be FIND\\n---\\nREPLACE");
        process.exit(1);
      }
      const findStr = data.substring(0, sepIdx);
      const replaceStr = data.substring(sepIdx + sep.length);

      let content = readFileLF(f);
      if (!content.includes(findStr)) {
        console.error("REPLACE: find string not found in file");
        console.error(findContext(content, findStr));
        process.exit(1);
      }
      const newContent = content.replaceAll(findStr, replaceStr);
      if (dryRun) {
        console.log("[DRY-RUN] replace " + f);
        showDiff(content, newContent);
      } else {
        const bak = backup(f);
        const count = content.split(findStr).length - 1;
        fs.writeFileSync(f, newContent, "utf-8");
        console.log("REPLACED " + count + " occurrence(s) -> " + f);
        if (bak) console.log("  backup: " + bak);
      }
    });
    break;
  }

  // ======== replace-block ========
  case "replace-block": {
    const f = args[1];
    if (!f) usage();
    readStdin(data => {
      // Unified stdin format: ---marker\n<marker>\n---body\n<replacement>
      const mSep = "---marker\n";
      const bSep = "\n---body\n";
      const mIdx = data.startsWith(mSep) ? 0 : data.indexOf("\n" + mSep) + 1;
      const bIdx = data.indexOf(bSep);
      if (mIdx < 0 || bIdx < 0 || bIdx <= mIdx) {

        console.error("REPLACE-BLOCK: stdin must be ---marker\\n<marker>\\n---body\\n<replacement>");
        process.exit(1);
      }
      const marker = data.substring(mIdx + mSep.length, bIdx);
      const replacement = data.substring(bIdx + bSep.length);


      let content = readFileLF(f);
      const markerIdx = content.indexOf(marker);
      if (markerIdx < 0) {
        console.error("REPLACE-BLOCK: marker not found in file");
        console.error("  marker: " + JSON.stringify(marker));
        console.error("  file first 80 chars: " + JSON.stringify(content.substring(0, 80)));
        process.exit(1);
      }
      const afterMarker = content.substring(markerIdx);
      const openBrace = afterMarker.indexOf("{");
      if (openBrace < 0) {
        console.error("REPLACE-BLOCK: no opening { found after marker");
        process.exit(1);
      }
      const openBracePos = markerIdx + openBrace;
      const closeBracePos = findMatchingBrace(content, openBracePos);
      if (closeBracePos < 0) {
        console.error("REPLACE-BLOCK: no matching } found");
        process.exit(1);
      }
      const endPos = skipPastBrace(content, closeBracePos);
      const newContent = content.substring(0, markerIdx) + replacement + content.substring(endPos);
      if (dryRun) {
        console.log("[DRY-RUN] replace-block " + f);
        showDiff(content, newContent);
      } else {
        const bak = backup(f);
        fs.writeFileSync(f, newContent, "utf-8");
        console.log("REPLACED-BLOCK -> " + f);
        if (bak) console.log("  backup: " + bak);
      }
    });
    break;
  }

  // ======== replace-all ========
  case "replace-all": {
    const f = args[1]; if (!f) usage();
    readStdin(data => {
      // Batch format: FIND1\n---\nREPLACE1\n===\nFIND2\n---\nREPLACE2 ...
      const blocks = data.split("\n===\n");

      let content = readFileLF(f);
      let totalCount = 0;
      for (const block of blocks) {
        const sepIdx = block.indexOf("\n---\n");
        if (sepIdx < 0) {
          console.error("REPLACE-ALL: each block must be FIND\\n---\\nREPLACE");
          process.exit(1);
        }
        const findStr = block.substring(0, sepIdx);
        const replaceStr = block.substring(sepIdx + 4);
        if (!content.includes(findStr)) {
          console.error("REPLACE-ALL: find string not found: " + JSON.stringify(findStr.substring(0, 60)));
          console.error(findContext(content, findStr));
          process.exit(1);
        }
        const count = content.split(findStr).length - 1;
        totalCount += count;
        content = content.replaceAll(findStr, replaceStr);
      }
      if (dryRun) {
        console.log("[DRY-RUN] replace-all " + f + " (" + totalCount + " total changes)");
        showDiff(readFileUTF8(f), content);
      } else {
        const bak = backup(f);
        fs.writeFileSync(f, content, "utf-8");
        console.log("REPLACED-ALL " + blocks.length + " patterns, " + totalCount + " total occurrence(s) -> " + f);
        if (bak) console.log("  backup: " + bak);
      }
    });
    break;
  }

  // ======== replace-lines ========
  case "replace-lines": {
    const f = args[1], from = parseInt(args[2]), to = parseInt(args[3]);
    if (!f || isNaN(from) || isNaN(to)) usage();
    const origContent = readFileUTF8(f);
    const origLF = origContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const hasCRLF = origContent.includes("\r\n");
    const origLines = origLF.split("\n");
    const fromIdx = from - 1;
    const toIdx = to - 1;
    if (fromIdx < 0 || toIdx >= origLines.length || fromIdx > toIdx) {
      console.error("REPLACE-LINES: invalid range " + from + "-" + to + " (file has " + origLines.length + " lines)");
      process.exit(1);
    }
    readStdin(data => {
      // Preserve original line endings
      const replacement = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const before = origLines.slice(0, fromIdx);
      const after = origLines.slice(toIdx + 1);
      const newLines = [...before, ...replacement.split("\n"), ...after];
      let newContent = newLines.join("\n");
      if (hasCRLF) newContent = newContent.replace(/\n/g, "\r\n");
      if (dryRun) {
        console.log("[DRY-RUN] replace-lines " + f + " lines " + from + "-" + to + " (" + (to - from + 1) + " old, " + replacement.split(/\r?\n/).length + " new lines)");
      } else {
        const bak = backup(f);
        fs.writeFileSync(f, newContent, "utf-8");
        console.log("REPLACED lines " + from + "-" + to + " (" + (to - from + 1) + " -> " + replacement.split(/\r?\n/).length + " lines) -> " + f);
        if (bak) console.log("  backup: " + bak);
      }
    });
    break;
  }

  // ======== delete-lines ========
  case "delete-lines": {
    const f = args[1], from = parseInt(args[2]), to = parseInt(args[3]);
    if (!f || isNaN(from) || isNaN(to)) usage();

    let content = readFileLF(f);
    const lines = content.split("\n");
    const fromIdx = from - 1;
    const toIdx = to - 1;
    if (fromIdx < 0 || toIdx >= lines.length || fromIdx > toIdx) {
      console.error("DELETE-LINES: invalid range " + from + "-" + to + " (file has " + lines.length + " lines)");
      process.exit(1);
    }
    const deleted = lines.splice(fromIdx, toIdx - fromIdx + 1);
    const newContent = lines.join("\n");
    if (dryRun) {
      console.log("[DRY-RUN] delete-lines " + f + " lines " + from + "-" + to);
      for (const dl of deleted) console.log("- " + dl);
    } else {
      const bak = backup(f);
      fs.writeFileSync(f, newContent, "utf-8");
      console.log("DELETED lines " + from + "-" + to + " (" + deleted.length + " lines) -> " + f);
      if (bak) console.log("  backup: " + bak);
    }
    break;
  }

  // ======== insert-at ========
  case "insert-at": {
    const f = args[1], lineNum = parseInt(args[2]);
    if (!f || isNaN(lineNum)) usage();
    readStdin(data => {

      let content = readFileLF(f);
      const lines = content.split("\n");
      const idx = lineNum - 1;

      if (idx < 0 || idx > lines.length) {
        console.error("INSERT-AT: invalid line " + lineNum + " (file has " + lines.length + " lines, valid: 1-" + (lines.length + 1) + ")");
        process.exit(1);
      }
      // Ensure insert content ends with newline if it doesn't already
      const insert = data.endsWith("\n") ? data.slice(0, -1) : data;
      lines.splice(idx, 0, insert);
      const newContent = lines.join("\n");
      if (dryRun) {
        console.log("[DRY-RUN] insert-at " + f + " before line " + lineNum);
        showDiff(content, newContent);
      } else {
        const bak = backup(f);
        fs.writeFileSync(f, newContent, "utf-8");
        console.log("INSERTED " + insert.split("\n").length + " line(s) before line " + lineNum + " -> " + f);
        if (bak) console.log("  backup: " + bak);
      }
    });
    break;
  }

  // ======== mkdir ========
  case "mkdir": {
    const d = args[1]; if (!d) usage();
    fs.mkdirSync(d, { recursive: true });
    console.log("MKDIR " + d);
    break;
  }

  // ======== ls ========
  case "ls": {
    const d = args[1] || ".";
    const items = fs.readdirSync(d, { withFileTypes: true });
    for (const item of items) console.log((item.isDirectory() ? "[dir] " : "      ") + item.name);
    break;
  }

  // ======== replace-str ========
  case "replace-str": {
    const f = args[1], findStr = args[2], replaceStr = args[3];
    if (!f || findStr === undefined || replaceStr === undefined) {
      console.error("replace-str: usage: replace-str <file> <find> <replace>");
      usage();
    }
    let content = readFileUTF8(f);
    if (!content.includes(findStr)) {
      console.error("REPLACE-STR: find string not found in " + f);
      console.error(findContext(content, findStr));
      process.exit(1);
    }
    const newContent = content.replaceAll(findStr, replaceStr);
    if (dryRun) {
      console.log("[DRY-RUN] replace-str " + f);
      showDiff(content, newContent);
    } else {
      const bak = backup(f);
      fs.writeFileSync(f, newContent, "utf-8");
      console.log("REPLACED-STR -> " + f);
      if (bak) console.log("  backup: " + bak);
    }
    break;
  }

  // ======== search ========

  case "search": {
    const pattern = args[1];
    const dir = args[2] || ".";
    const _glob = args[3] || "*.dart";
    if (!pattern) { console.error("SEARCH: pattern required"); usage(); }

    function searchFile(filePath) {
      const content = fs.readFileSync(filePath, "utf-8");
      const fileLines = content.split("\n");
      for (let i = 0; i < fileLines.length; i++) {
        if (fileLines[i].includes(pattern)) {
          console.log(filePath + ":" + (i + 1) + ": " + fileLines[i].trim().substring(0, 200));
        }
      }
    }

    function walk(d) {
      if (fs.statSync(d).isFile()) { searchFile(d); return; }
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) {
          if (ent.name.startsWith(".") || ent.name === "node_modules" || ent.name === "build" || ent.name === ".dart_tool") continue;
          walk(full);
        } else if (ent.isFile()) {
          if (_glob !== "*") {
            const ext = path.extname(ent.name);
            const wantExt = _glob.startsWith("*.") ? _glob.slice(1) : _glob;
            if (ext !== wantExt && _glob !== "*") continue;
          }
          try { searchFile(full); } catch (_) {}
        }
      }
    }
    walk(path.resolve(dir));
    break;
  }


  default: usage();
}
