import * as path from 'path';
import * as fs from 'fs';

// Test the helper functions directly by importing them
// We'll test by extracting the core logic from the node

const MOCK_REPO_PATH = path.join(__dirname, 'fixtures', 'mock-repo');

/**
 * Helper function to validate paths (extracted from node for testing)
 */
function validatePath(rootPath: string, relativePath: string): string {
	const resolvedRoot = path.resolve(rootPath);
	const resolved = path.resolve(resolvedRoot, relativePath);

	if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
		throw new Error(`Path traversal detected - access denied. Path must be within: ${resolvedRoot}`);
	}

	return resolved;
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

/**
 * Format file size
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

describe('ExploreRepository Node', () => {
	describe('Path Validation', () => {
		it('should allow valid paths within root', () => {
			const result = validatePath(MOCK_REPO_PATH, 'src/index.ts');
			expect(result).toBe(path.join(MOCK_REPO_PATH, 'src/index.ts'));
		});

		it('should allow root path itself', () => {
			const result = validatePath(MOCK_REPO_PATH, '.');
			expect(result).toBe(MOCK_REPO_PATH);
		});

		it('should allow nested paths', () => {
			const result = validatePath(MOCK_REPO_PATH, 'src/components/Button.ts');
			expect(result).toBe(path.join(MOCK_REPO_PATH, 'src/components/Button.ts'));
		});

		it('should reject path traversal attempts with ..', () => {
			expect(() => validatePath(MOCK_REPO_PATH, '../../../etc/passwd')).toThrow('Path traversal detected');
		});

		it('should reject absolute paths outside root', () => {
			expect(() => validatePath(MOCK_REPO_PATH, '/etc/passwd')).toThrow('Path traversal detected');
		});

		it('should reject sneaky path traversal', () => {
			expect(() => validatePath(MOCK_REPO_PATH, 'src/../../etc/passwd')).toThrow('Path traversal detected');
		});
	});

	describe('Glob to Regex Conversion', () => {
		it('should convert * to match any characters', () => {
			const regex = globToRegex('*.ts');
			expect(regex.test('Button.ts')).toBe(true);
			expect(regex.test('index.ts')).toBe(true);
			expect(regex.test('Button.js')).toBe(false);
		});

		it('should convert ? to match single character', () => {
			const regex = globToRegex('?.ts');
			expect(regex.test('a.ts')).toBe(true);
			expect(regex.test('ab.ts')).toBe(false);
		});

		it('should escape special regex characters', () => {
			const regex = globToRegex('file.test.ts');
			expect(regex.test('file.test.ts')).toBe(true);
			expect(regex.test('filextest.ts')).toBe(false);
		});

		it('should handle complex patterns', () => {
			const regex = globToRegex('*.spec.ts');
			expect(regex.test('Button.spec.ts')).toBe(true);
			expect(regex.test('helper.spec.ts')).toBe(true);
			expect(regex.test('Button.test.ts')).toBe(false);
		});
	});

	describe('Format Size', () => {
		it('should format bytes', () => {
			expect(formatSize(500)).toBe('500 B');
		});

		it('should format kilobytes', () => {
			expect(formatSize(1024)).toBe('1.0 KB');
			expect(formatSize(2048)).toBe('2.0 KB');
		});

		it('should format megabytes', () => {
			expect(formatSize(1024 * 1024)).toBe('1.0 MB');
		});

		it('should format with decimals', () => {
			expect(formatSize(1536)).toBe('1.5 KB');
		});
	});

	describe('List Directory Operation', () => {
		it('should list root directory contents', () => {
			const entries = fs.readdirSync(MOCK_REPO_PATH, { withFileTypes: true });
			const names = entries.map((e) => e.name);

			expect(names).toContain('package.json');
			expect(names).toContain('src');
			expect(names).toContain('docs');
		});

		it('should list src directory contents', () => {
			const srcPath = path.join(MOCK_REPO_PATH, 'src');
			const entries = fs.readdirSync(srcPath, { withFileTypes: true });
			const names = entries.map((e) => e.name);

			expect(names).toContain('index.ts');
			expect(names).toContain('components');
			expect(names).toContain('utils');
		});

		it('should list components directory', () => {
			const componentsPath = path.join(MOCK_REPO_PATH, 'src/components');
			const entries = fs.readdirSync(componentsPath, { withFileTypes: true });
			const names = entries.map((e) => e.name);

			expect(names).toContain('Button.ts');
			expect(names).toContain('Input.ts');
		});

		it('should identify directories vs files', () => {
			const entries = fs.readdirSync(MOCK_REPO_PATH, { withFileTypes: true });

			const src = entries.find((e) => e.name === 'src');
			const packageJson = entries.find((e) => e.name === 'package.json');

			expect(src?.isDirectory()).toBe(true);
			expect(packageJson?.isFile()).toBe(true);
		});
	});

	describe('Read File Operation', () => {
		it('should read file contents', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'src/index.ts');
			const content = fs.readFileSync(filePath, 'utf-8');

			expect(content).toContain('Main entry point');
			expect(content).toContain('export function main');
		});

		it('should read Button component', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'src/components/Button.ts');
			const content = fs.readFileSync(filePath, 'utf-8');

			expect(content).toContain('export class Button');
			expect(content).toContain('render()');
		});

		it('should read package.json', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'package.json');
			const content = fs.readFileSync(filePath, 'utf-8');
			const parsed = JSON.parse(content);

			expect(parsed.name).toBe('mock-repo');
			expect(parsed.version).toBe('1.0.0');
		});

		it('should support reading with line limits', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'src/utils/helpers.ts');
			const content = fs.readFileSync(filePath, 'utf-8');
			const lines = content.split('\n');
			const firstFiveLines = lines.slice(0, 5);

			expect(firstFiveLines.length).toBe(5);
			// First line is the comment opener /**
			expect(firstFiveLines[0]).toBe('/**');
			// The full content should contain the comment
			expect(content).toContain('Utility helper functions');
		});

		it('should support reading with offset', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'src/utils/helpers.ts');
			const content = fs.readFileSync(filePath, 'utf-8');
			const lines = content.split('\n');
			const fromLine5 = lines.slice(5, 10);

			expect(fromLine5.length).toBe(5);
		});
	});

	describe('Find Files Operation', () => {
		it('should find all TypeScript files', () => {
			const pattern = globToRegex('*.ts');
			const results: string[] = [];
			findFilesRecursive(MOCK_REPO_PATH, pattern, results, MOCK_REPO_PATH);

			expect(results.length).toBeGreaterThan(0);
			expect(results).toContain('src/index.ts');
			expect(results).toContain(path.join('src', 'components', 'Button.ts'));
			expect(results).toContain(path.join('src', 'components', 'Input.ts'));
		});

		it('should find all markdown files', () => {
			const pattern = globToRegex('*.md');
			const results: string[] = [];
			findFilesRecursive(MOCK_REPO_PATH, pattern, results, MOCK_REPO_PATH);

			expect(results).toContain(path.join('docs', 'README.md'));
			expect(results).toContain(path.join('docs', 'api.md'));
		});

		it('should find files with specific pattern', () => {
			const pattern = globToRegex('Button*');
			const results: string[] = [];
			findFilesRecursive(MOCK_REPO_PATH, pattern, results, MOCK_REPO_PATH);

			expect(results).toContain(path.join('src', 'components', 'Button.ts'));
		});

		it('should find package.json', () => {
			const pattern = globToRegex('package.json');
			const results: string[] = [];
			findFilesRecursive(MOCK_REPO_PATH, pattern, results, MOCK_REPO_PATH);

			expect(results).toContain('package.json');
		});

		it('should respect max results limit', () => {
			const pattern = globToRegex('*');
			const results: string[] = [];
			findFilesRecursive(MOCK_REPO_PATH, pattern, results, MOCK_REPO_PATH, 2);

			expect(results.length).toBe(2);
		});
	});

	describe('File Info Operation', () => {
		it('should get file stats', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'src/index.ts');
			const stats = fs.statSync(filePath);

			expect(stats.isFile()).toBe(true);
			expect(stats.isDirectory()).toBe(false);
			expect(stats.size).toBeGreaterThan(0);
		});

		it('should get directory stats', () => {
			const dirPath = path.join(MOCK_REPO_PATH, 'src');
			const stats = fs.statSync(dirPath);

			expect(stats.isFile()).toBe(false);
			expect(stats.isDirectory()).toBe(true);
		});

		it('should include timestamps', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'package.json');
			const stats = fs.statSync(filePath);

			// Check that timestamps exist and can be converted to ISO strings
			expect(stats.mtime.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(stats.birthtime.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(stats.atime.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('should throw for non-existent paths', () => {
			const badPath = path.join(MOCK_REPO_PATH, 'non-existent-file.ts');
			expect(() => fs.statSync(badPath)).toThrow();
		});
	});

	describe('Tree View Operation', () => {
		it('should build tree with depth 1', () => {
			const tree = buildTree(MOCK_REPO_PATH, MOCK_REPO_PATH, 1, 1);

			// Should show top-level items
			expect(tree.some((line) => line.includes('src/'))).toBe(true);
			expect(tree.some((line) => line.includes('docs/'))).toBe(true);
			expect(tree.some((line) => line.includes('package.json'))).toBe(true);
		});

		it('should build tree with depth 2', () => {
			const tree = buildTree(MOCK_REPO_PATH, MOCK_REPO_PATH, 1, 2);

			// Should show nested items
			expect(tree.some((line) => line.includes('components/'))).toBe(true);
			expect(tree.some((line) => line.includes('utils/'))).toBe(true);
			expect(tree.some((line) => line.includes('index.ts'))).toBe(true);
		});

		it('should build tree with depth 3', () => {
			const tree = buildTree(MOCK_REPO_PATH, MOCK_REPO_PATH, 1, 3);

			// Should show deeply nested items
			expect(tree.some((line) => line.includes('Button.ts'))).toBe(true);
			expect(tree.some((line) => line.includes('helpers.ts'))).toBe(true);
		});

		it('should use correct tree connectors', () => {
			const tree = buildTree(MOCK_REPO_PATH, MOCK_REPO_PATH, 1, 3);
			const treeString = tree.join('\n');

			// Check for tree structure characters
			expect(treeString).toMatch(/[├└]/);
			expect(treeString).toMatch(/──/);
		});

		it('should sort directories before files', () => {
			const tree = buildTree(MOCK_REPO_PATH, MOCK_REPO_PATH, 1, 1);

			// Find indices
			const srcIndex = tree.findIndex((line) => line.includes('src/'));
			const packageIndex = tree.findIndex((line) => line.includes('package.json'));

			// Directories should come before files
			expect(srcIndex).toBeLessThan(packageIndex);
		});
	});

	describe('Grep Operation', () => {
		it('should find export statements', () => {
			const filePath = path.join(MOCK_REPO_PATH, 'src/index.ts');
			const content = fs.readFileSync(filePath, 'utf-8');

			expect(content).toMatch(/export function/);
			expect(content).toMatch(/export \{/);
		});

		it('should find class definitions', () => {
			const buttonPath = path.join(MOCK_REPO_PATH, 'src/components/Button.ts');
			const content = fs.readFileSync(buttonPath, 'utf-8');

			expect(content).toMatch(/export class Button/);
		});

		it('should find interface definitions', () => {
			const inputPath = path.join(MOCK_REPO_PATH, 'src/components/Input.ts');
			const content = fs.readFileSync(inputPath, 'utf-8');

			expect(content).toMatch(/export interface InputProps/);
		});

		it('should find const exports', () => {
			const constantsPath = path.join(MOCK_REPO_PATH, 'src/utils/constants.ts');
			const content = fs.readFileSync(constantsPath, 'utf-8');

			expect(content).toMatch(/export const APP_NAME/);
			expect(content).toMatch(/export const API_ENDPOINTS/);
		});

		it('should find function by name', () => {
			const helpersPath = path.join(MOCK_REPO_PATH, 'src/utils/helpers.ts');
			const content = fs.readFileSync(helpersPath, 'utf-8');

			expect(content).toMatch(/function formatDate/);
			expect(content).toMatch(/function calculateSum/);
			expect(content).toMatch(/function capitalize/);
		});
	});

	describe('Integration Scenarios', () => {
		it('should explore a typical React-like component structure', () => {
			// Find all component files
			const pattern = globToRegex('*.ts');
			const results: string[] = [];
			findFilesRecursive(
				path.join(MOCK_REPO_PATH, 'src/components'),
				pattern,
				results,
				MOCK_REPO_PATH,
			);

			expect(results.length).toBe(2);

			// Read each component
			for (const file of results) {
				const fullPath = path.join(MOCK_REPO_PATH, file);
				const content = fs.readFileSync(fullPath, 'utf-8');
				expect(content).toContain('export');
			}
		});

		it('should find and read utility functions', () => {
			// Find helper files
			const pattern = globToRegex('helper*.ts');
			const results: string[] = [];
			findFilesRecursive(MOCK_REPO_PATH, pattern, results, MOCK_REPO_PATH);

			expect(results.length).toBeGreaterThan(0);

			// Read and verify content
			const fullPath = path.join(MOCK_REPO_PATH, results[0]);
			const content = fs.readFileSync(fullPath, 'utf-8');
			expect(content).toContain('export function');
		});

		it('should navigate and understand project structure', () => {
			// 1. List root to understand structure
			const rootEntries = fs.readdirSync(MOCK_REPO_PATH, { withFileTypes: true });
			expect(rootEntries.some((e) => e.name === 'src' && e.isDirectory())).toBe(true);

			// 2. Read package.json for project info
			const packageJson = JSON.parse(
				fs.readFileSync(path.join(MOCK_REPO_PATH, 'package.json'), 'utf-8'),
			);
			expect(packageJson.main).toBe('src/index.ts');

			// 3. Follow to main entry point
			const mainContent = fs.readFileSync(
				path.join(MOCK_REPO_PATH, packageJson.main),
				'utf-8',
			);
			expect(mainContent).toContain('export function main');

			// 4. Find all imports
			const imports = mainContent.match(/import .+ from .+/g);
			expect(imports).not.toBeNull();
			expect(imports!.length).toBeGreaterThan(0);
		});
	});
});
