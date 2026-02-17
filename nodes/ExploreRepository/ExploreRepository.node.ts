import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Validates that a path is within the allowed root directory.
 * Prevents path traversal attacks.
 */
function validatePath(rootPath: string, relativePath: string): string {
	const resolvedRoot = path.resolve(rootPath);
	const resolved = path.resolve(resolvedRoot, relativePath);

	if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
		throw new ApplicationError(
			`Path traversal detected - access denied. ` +
			`Attempted path: "${relativePath}" resolved to "${resolved}". ` +
			`Path must be relative and within root: "${resolvedRoot}"`
		);
	}

	return resolved;
}

/**
 * Gets file/directory stats with error handling
 */
function getStats(filePath: string): fs.Stats | null {
	try {
		return fs.statSync(filePath);
	} catch {
		return null;
	}
}

/**
 * Formats file size to human readable string
 */
function formatSize(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Recursively builds a directory tree
 */
function buildTree(
	dirPath: string,
	rootPath: string,
	currentDepth: number,
	maxDepth: number,
	prefix: string = '',
): string[] {
	if (currentDepth > maxDepth) {
		return [];
	}

	const lines: string[] = [];
	let entries: fs.Dirent[];

	try {
		entries = fs.readdirSync(dirPath, { withFileTypes: true });
	} catch {
		return [`${prefix}[Permission denied]`];
	}

	// Sort: directories first, then files, alphabetically
	entries.sort((a, b) => {
		if (a.isDirectory() && !b.isDirectory()) return -1;
		if (!a.isDirectory() && b.isDirectory()) return 1;
		return a.name.localeCompare(b.name);
	});

	// Filter out hidden files and common ignore patterns
	entries = entries.filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules');

	entries.forEach((entry, index) => {
		const isLast = index === entries.length - 1;
		const connector = isLast ? '└── ' : '├── ';
		const childPrefix = isLast ? '    ' : '│   ';

		if (entry.isDirectory()) {
			lines.push(`${prefix}${connector}${entry.name}/`);
			if (currentDepth < maxDepth) {
				const childPath = path.join(dirPath, entry.name);
				lines.push(...buildTree(childPath, rootPath, currentDepth + 1, maxDepth, prefix + childPrefix));
			}
		} else {
			lines.push(`${prefix}${connector}${entry.name}`);
		}
	});

	return lines;
}

/**
 * Recursively finds files matching a glob pattern
 */
function findFilesRecursive(
	dirPath: string,
	pattern: RegExp,
	results: string[],
	rootPath: string,
	maxResults: number = 1000,
): void {
	if (results.length >= maxResults) return;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dirPath, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (results.length >= maxResults) break;

		// Skip hidden files and node_modules
		if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

		const fullPath = path.join(dirPath, entry.name);
		const relativePath = path.relative(rootPath, fullPath);

		if (entry.isDirectory()) {
			findFilesRecursive(fullPath, pattern, results, rootPath, maxResults);
		} else if (pattern.test(entry.name)) {
			results.push(relativePath);
		}
	}
}

/**
 * Converts a glob pattern to a regex
 */
function globToRegex(glob: string): RegExp {
	const escaped = glob
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`, 'i');
}

export class ExploreRepository implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Explore Repository',
		name: 'exploreRepository',
		icon: { light: 'file:explore-repository.svg', dark: 'file:explore-repository.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Explore codebases: list directories, read files, search content (grep), find files by pattern, get file info, or view directory trees. Set operation to: listDirectory, readFile, grep, findFiles, fileInfo, or tree.',
		defaults: {
			name: 'Explore Repository',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Root Path',
				name: 'rootPath',
				type: 'string',
				default: '',
				required: true,
				placeholder: '/path/to/repository',
				description: 'The root directory to explore. All operations are sandboxed to this path.',
			},
			// eslint-disable-next-line n8n-nodes-base/node-param-operation-without-no-data-expression
			{
				// noDataExpression intentionally omitted to allow AI agents to select operations dynamically
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				description: 'Choose operation: "fileInfo", "findFiles", "grep", "listDirectory", "readFile", or "tree"',
				options: [
					{
						name: 'File Info',
						value: 'fileInfo',
						description: 'Get metadata about a file (size, dates, permissions)',
						action: 'Get metadata about a file',
					},
					{
						name: 'Find Files',
						value: 'findFiles',
						description: 'Find files by name pattern (glob syntax like *.ts)',
						action: 'Find files by name pattern',
					},
					{
						name: 'Grep (Search Contents)',
						value: 'grep',
						description: 'Search for text patterns in files using regex',
						action: 'Search for text patterns in files',
					},
					{
						name: 'List Directory',
						value: 'listDirectory',
						description: 'List files and folders in a directory',
						action: 'List files and folders in a directory',
					},
					{
						name: 'Read File',
						value: 'readFile',
						description: 'Read the contents of a file',
						action: 'Read the contents of a file',
					},
					{
						name: 'Tree View',
						value: 'tree',
						description: 'Get a directory tree structure visualization',
						action: 'Get a directory tree structure',
					},
				],
				default: 'listDirectory',
			},
			// Universal path parameter for all operations
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				placeholder: 'src/index.ts or src/components',
				description: 'Path relative to root. For readFile/fileInfo: path to a file. For listDirectory/grep/findFiles/tree: path to a directory (empty = root).',
			},
			// readFile options
			{
				displayName: 'Max Lines',
				name: 'maxLines',
				type: 'number',
				default: 0,
				placeholder: '100',
				description: 'For readFile: Maximum number of lines to read (0 = all lines)',
			},
			{
				displayName: 'Line Offset',
				name: 'lineOffset',
				type: 'number',
				default: 0,
				placeholder: '0',
				description: 'For readFile: Start reading from this line number (0-based)',
			},
			// grep options
			{
				displayName: 'Search Pattern',
				name: 'searchPattern',
				type: 'string',
				default: '',
				placeholder: 'function.*export',
				description: 'For grep: Regular expression pattern to search for (required)',
			},
			{
				displayName: 'File Pattern',
				name: 'filePattern',
				type: 'string',
				default: '*',
				placeholder: '*.ts',
				description: 'For grep: Glob pattern to filter which files to search (e.g., *.ts, *.js)',
			},
			{
				displayName: 'Case Insensitive',
				name: 'caseInsensitive',
				type: 'boolean',
				default: false,
				description: 'Whether to perform case-insensitive search (for grep operation)',
			},
			{
				displayName: 'Context Lines',
				name: 'contextLines',
				type: 'number',
				default: 0,
				description: 'For grep: Number of lines to show before and after each match',
			},
			// findFiles options
			{
				displayName: 'Name Pattern',
				name: 'namePattern',
				type: 'string',
				default: '*',
				placeholder: '*.ts',
				description: 'For findFiles: Glob pattern for file names (e.g., *.ts, test_*.py)',
			},
			// tree options
			{
				displayName: 'Max Depth',
				name: 'maxDepth',
				type: 'number',
				default: 3,
				description: 'For tree: Maximum depth of the tree (1-10)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const rootPath = this.getNodeParameter('rootPath', itemIndex, '') as string;
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;

				if (!rootPath) {
					throw new NodeOperationError(this.getNode(), 'Root path is required', { itemIndex });
				}

				const resolvedRoot = path.resolve(rootPath);

				// Verify root path exists and is a directory
				const rootStats = getStats(resolvedRoot);
				if (!rootStats || !rootStats.isDirectory()) {
					throw new NodeOperationError(this.getNode(), `Root path does not exist or is not a directory: ${resolvedRoot}`, { itemIndex });
				}

				let result: IDataObject;

				switch (operation) {
					case 'listDirectory': {
						const targetPath = this.getNodeParameter('path', itemIndex, '') as string;
						const fullPath = validatePath(resolvedRoot, targetPath || '.');

						const dirStats = getStats(fullPath);
						if (!dirStats) {
							result = {
								operation: 'listDirectory',
								path: targetPath || '.',
								found: false,
								message: `Directory not found: ${targetPath || '.'}`,
							};
							break;
						}

						if (!dirStats.isDirectory()) {
							result = {
								operation: 'listDirectory',
								path: targetPath || '.',
								found: false,
								isFile: dirStats.isFile(),
								message: `Path exists but is not a directory: ${targetPath}`,
							};
							break;
						}

						const entries = fs.readdirSync(fullPath, { withFileTypes: true });
						const files: Array<{
							name: string;
							type: 'file' | 'directory' | 'symlink' | 'other';
							size?: string;
							sizeBytes?: number;
						}> = [];

						for (const entry of entries) {
							const entryPath = path.join(fullPath, entry.name);
							const stats = getStats(entryPath);

							let type: 'file' | 'directory' | 'symlink' | 'other' = 'other';
							if (entry.isDirectory()) type = 'directory';
							else if (entry.isFile()) type = 'file';
							else if (entry.isSymbolicLink()) type = 'symlink';

							const fileInfo: {
								name: string;
								type: 'file' | 'directory' | 'symlink' | 'other';
								size?: string;
								sizeBytes?: number;
							} = { name: entry.name, type };

							if (stats && entry.isFile()) {
								fileInfo.size = formatSize(stats.size);
								fileInfo.sizeBytes = stats.size;
							}

							files.push(fileInfo);
						}

						// Sort: directories first, then alphabetically
						files.sort((a, b) => {
							if (a.type === 'directory' && b.type !== 'directory') return -1;
							if (a.type !== 'directory' && b.type === 'directory') return 1;
							return a.name.localeCompare(b.name);
						});

						result = {
							operation: 'listDirectory',
							path: targetPath || '.',
							found: true,
							totalItems: files.length,
							directories: files.filter((f) => f.type === 'directory').length,
							files: files.filter((f) => f.type === 'file').length,
							entries: files,
						};
						break;
					}

					case 'readFile': {
						const targetPath = this.getNodeParameter('path', itemIndex, '') as string;
						const maxLines = this.getNodeParameter('maxLines', itemIndex, 0) as number;
						const lineOffset = this.getNodeParameter('lineOffset', itemIndex, 0) as number;

						if (!targetPath) {
							result = {
								operation: 'readFile',
								path: '',
								found: false,
								message: 'Path is required for readFile operation',
							};
							break;
						}

						const fullPath = validatePath(resolvedRoot, targetPath);
						const stats = getStats(fullPath);

						if (!stats) {
							result = {
								operation: 'readFile',
								path: targetPath,
								found: false,
								message: `File not found: ${targetPath}`,
							};
							break;
						}

						if (!stats.isFile()) {
							result = {
								operation: 'readFile',
								path: targetPath,
								found: false,
								isDirectory: stats.isDirectory(),
								message: `Path exists but is not a file: ${targetPath}`,
							};
							break;
						}

						const content = fs.readFileSync(fullPath, 'utf-8');
						let lines = content.split('\n');
						const totalLines = lines.length;

						if (lineOffset > 0) {
							lines = lines.slice(lineOffset);
						}

						if (maxLines > 0) {
							lines = lines.slice(0, maxLines);
						}

						// Add line numbers for easier reference
						const numberedLines = lines.map((line: string, idx: number) => ({
							lineNumber: lineOffset + idx + 1,
							content: line,
						}));

						result = {
							operation: 'readFile',
							path: targetPath,
							found: true,
							totalLines,
							linesReturned: lines.length,
							lineOffset,
							size: formatSize(stats.size),
							sizeBytes: stats.size,
							content: lines.join('\n'),
							lines: numberedLines,
						};
						break;
					}

					case 'grep': {
						const searchPattern = this.getNodeParameter('searchPattern', itemIndex, '') as string;
						const targetPath = this.getNodeParameter('path', itemIndex, '') as string;
						const filePattern = this.getNodeParameter('filePattern', itemIndex, '*') as string;
						const caseInsensitive = this.getNodeParameter('caseInsensitive', itemIndex, false) as boolean;
						const contextLines = this.getNodeParameter('contextLines', itemIndex, 0) as number;

						if (!searchPattern) {
							throw new NodeOperationError(this.getNode(), 'searchPattern is required for grep operation', { itemIndex });
						}

						const fullPath = validatePath(resolvedRoot, targetPath || '.');

						// Build grep command
						let grepCmd = 'grep -rn';
						if (caseInsensitive) grepCmd += ' -i';
						if (contextLines > 0) grepCmd += ` -C ${contextLines}`;
						if (filePattern && filePattern !== '*') {
							grepCmd += ` --include="${filePattern}"`;
						}
						// Exclude common non-code directories
						grepCmd += ' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build';
						grepCmd += ` -E "${searchPattern.replace(/"/g, '\\"')}" "${fullPath}"`;

						let grepOutput = '';
						try {
							grepOutput = execSync(grepCmd, {
								encoding: 'utf-8',
								maxBuffer: 10 * 1024 * 1024, // 10MB buffer
							});
						} catch (error: unknown) {
							// grep returns exit code 1 when no matches found
							if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
								grepOutput = '';
							} else if (error && typeof error === 'object' && 'stdout' in error) {
								grepOutput = (error as { stdout: string }).stdout || '';
							}
						}

						// Parse grep output
						const matches: Array<{
							file: string;
							lineNumber: number;
							content: string;
							isContext?: boolean;
						}> = [];

						if (grepOutput) {
							const outputLines = grepOutput.split('\n').filter((l) => l.trim());
							for (const line of outputLines) {
								// Format: filename:linenum:content or filename-linenum-content (for context)
								const colonMatch = line.match(/^(.+?):(\d+):(.*)$/);
								const dashMatch = line.match(/^(.+?)-(\d+)-(.*)$/);

								if (colonMatch) {
									matches.push({
										file: path.relative(resolvedRoot, colonMatch[1]),
										lineNumber: parseInt(colonMatch[2], 10),
										content: colonMatch[3],
									});
								} else if (dashMatch) {
									matches.push({
										file: path.relative(resolvedRoot, dashMatch[1]),
										lineNumber: parseInt(dashMatch[2], 10),
										content: dashMatch[3],
										isContext: true,
									});
								}
							}
						}

						// Group by file
						const byFile: Record<string, Array<{ lineNumber: number; content: string; isContext?: boolean }>> = {};
						for (const match of matches) {
							if (!byFile[match.file]) byFile[match.file] = [];
							byFile[match.file].push({
								lineNumber: match.lineNumber,
								content: match.content,
								isContext: match.isContext,
							});
						}

						result = {
							operation: 'grep',
							pattern: searchPattern,
							path: targetPath || '.',
							filePattern,
							caseInsensitive,
							totalMatches: matches.filter((m) => !m.isContext).length,
							filesWithMatches: Object.keys(byFile).length,
							matchesByFile: byFile,
							matches,
						};
						break;
					}

					case 'findFiles': {
						const namePattern = this.getNodeParameter('namePattern', itemIndex, '*') as string;
						const targetPath = this.getNodeParameter('path', itemIndex, '') as string;

						const fullPath = validatePath(resolvedRoot, targetPath || '.');
						const regex = globToRegex(namePattern);
						const foundFiles: string[] = [];

						findFilesRecursive(fullPath, regex, foundFiles, resolvedRoot);

						result = {
							operation: 'findFiles',
							pattern: namePattern,
							path: targetPath || '.',
							totalFound: foundFiles.length,
							files: foundFiles,
						};
						break;
					}

					case 'fileInfo': {
						const targetPath = this.getNodeParameter('path', itemIndex, '') as string;

						if (!targetPath) {
							result = {
								operation: 'fileInfo',
								path: '',
								exists: false,
								message: 'Path is required for fileInfo operation',
							};
							break;
						}

						const fullPath = validatePath(resolvedRoot, targetPath);
						const stats = getStats(fullPath);

						if (!stats) {
							result = {
								operation: 'fileInfo',
								path: targetPath,
								exists: false,
								message: `Path not found: ${targetPath}`,
							};
							break;
						}

						result = {
							operation: 'fileInfo',
							path: targetPath,
							exists: true,
							isFile: stats.isFile(),
							isDirectory: stats.isDirectory(),
							isSymbolicLink: stats.isSymbolicLink(),
							size: formatSize(stats.size),
							sizeBytes: stats.size,
							created: stats.birthtime.toISOString(),
							modified: stats.mtime.toISOString(),
							accessed: stats.atime.toISOString(),
							mode: stats.mode.toString(8),
						};
						break;
					}

					case 'tree': {
						const targetPath = this.getNodeParameter('path', itemIndex, '') as string;
						let maxDepth = this.getNodeParameter('maxDepth', itemIndex, 3) as number;

						// Clamp maxDepth between 1 and 10
						maxDepth = Math.max(1, Math.min(10, maxDepth));

						const fullPath = validatePath(resolvedRoot, targetPath || '.');
						const stats = getStats(fullPath);

						if (!stats) {
							result = {
								operation: 'tree',
								path: targetPath || '.',
								found: false,
								message: `Directory not found: ${targetPath || '.'}`,
							};
							break;
						}

						if (!stats.isDirectory()) {
							result = {
								operation: 'tree',
								path: targetPath || '.',
								found: false,
								isFile: stats.isFile(),
								message: `Path exists but is not a directory: ${targetPath}`,
							};
							break;
						}

						const treeLines = buildTree(fullPath, resolvedRoot, 1, maxDepth);
						const rootName = targetPath || path.basename(resolvedRoot);

						result = {
							operation: 'tree',
							path: targetPath || '.',
							found: true,
							maxDepth,
							tree: `${rootName}/\n${treeLines.join('\n')}`,
							treeLines: [rootName + '/', ...treeLines],
						};
						break;
					}

					default:
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex });
				}

				returnData.push({ json: result });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: itemIndex,
					});
				} else {
					if (error instanceof NodeOperationError) {
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error instanceof Error ? error : new Error(String(error)), {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
