# n8n-nodes-explore-repository

This is an n8n community node that enables AI agents to explore codebases and local filesystems. It provides operations for listing directories, reading files, searching content (grep), finding files by pattern, getting file metadata, and viewing directory trees.

> **Note:** This node requires filesystem access and is designed for **self-hosted n8n instances**. It is not compatible with n8n Cloud.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

```bash
npm install n8n-nodes-explore-repository
```

Or install via **Settings > Community Nodes** in your n8n instance.

## Operations

| Operation | Description |
|-----------|-------------|
| **File Info** | Get metadata about a file (size, dates, permissions) |
| **Find Files** | Find files by name pattern (glob syntax like `*.ts`) |
| **Grep (Search Contents)** | Search for text patterns in files using regex |
| **List Directory** | List files and folders in a directory |
| **Read File** | Read the contents of a file |
| **Tree View** | Get a directory tree structure visualization |

## Parameters

| Parameter | Description |
|-----------|-------------|
| `rootPath` | Base directory for all operations (required). All paths are sandboxed to this directory for security. |
| `operation` | The operation to perform |
| `path` | Target path relative to root. For file operations: path to a file. For directory operations: path to a directory (empty = root). |
| `searchPattern` | For grep: Regular expression pattern to search for |
| `namePattern` | For findFiles: Glob pattern for file names (e.g., `*.ts`) |
| `filePattern` | For grep: Glob pattern to filter which files to search |
| `maxLines` | For readFile: Maximum number of lines to read (0 = all) |
| `lineOffset` | For readFile: Start reading from this line number |
| `maxDepth` | For tree: Maximum depth of the tree (1-10) |
| `caseInsensitive` | For grep: Whether to perform case-insensitive search |
| `contextLines` | For grep: Number of lines to show before and after each match |

## Usage with AI Agents

This node is designed to be used as an AI tool (`usableAsTool: true`). The AI agent can dynamically select operations and provide parameters.

### Enabling AI Operation Selection

To allow an AI agent to choose the operation dynamically, use the `$fromAI()` expression in the Operation field:

```
{{ $fromAI("operation", "Choose operation: \"listDirectory\" (list files/folders), \"readFile\" (read file contents), \"grep\" (search text in files), \"findFiles\" (find by name pattern), \"fileInfo\" (get file metadata), \"tree\" (directory tree view)", "string") }}
```

### Example AI Tool Calls

**List a directory:**
```json
{
  "rootPath": "/path/to/repo",
  "operation": "listDirectory",
  "path": "src/components"
}
```

**Read a file:**
```json
{
  "rootPath": "/path/to/repo",
  "operation": "readFile",
  "path": "package.json"
}
```

**Search for patterns:**
```json
{
  "rootPath": "/path/to/repo",
  "operation": "grep",
  "path": "src",
  "searchPattern": "export function",
  "filePattern": "*.ts"
}
```

**Find files by pattern:**
```json
{
  "rootPath": "/path/to/repo",
  "operation": "findFiles",
  "path": "",
  "namePattern": "*.test.ts"
}
```

### Handling Missing Files

When a file or directory doesn't exist, the node returns a result with `found: false` instead of throwing an error. This allows AI agents to gracefully handle missing paths:

```json
{
  "operation": "readFile",
  "path": "missing-file.txt",
  "found": false,
  "message": "File not found: missing-file.txt"
}
```

## Security

All file operations are **sandboxed** to the configured `rootPath`. Path traversal attempts (e.g., `../../../etc/passwd`) are blocked and will throw an error.

## Compatibility

- **n8n version:** 1.0.0 or later
- **Node.js:** 18.x or later
- **Platform:** Self-hosted n8n only (not compatible with n8n Cloud due to filesystem access requirements)

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [GitHub Repository](https://github.com/Traction-Rec/n8n-nodes-explore-repository)

## License

MIT
