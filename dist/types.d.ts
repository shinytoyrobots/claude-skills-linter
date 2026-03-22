/**
 * Shared types for the skill-lint project.
 * Canonical home for all types used across stories.
 */
/** Classification of a skill file based on its path. */
export type FileType = 'command' | 'agent' | 'legacy-agent' | 'context' | 'readme' | 'unknown';
/** An error encountered during frontmatter parsing. */
export type ParseError = {
    message: string;
    filePath: string;
};
/** Result of extracting frontmatter and metadata from a skill file. */
export type ExtractResult = {
    data: Record<string, unknown>;
    errors: ParseError[];
    filePath: string;
    fileType: FileType;
};
/** A single validation finding from a rule. */
export type ValidationResult = {
    filePath: string;
    rule: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
};
/** Directory-level quality level overrides. */
export type LevelOverrides = Record<string, number>;
/** Tool registry configuration. */
export type ToolsConfig = {
    mcp_pattern: string;
    custom: string[];
};
/** File size limits. */
export type LimitsConfig = {
    max_file_size: number;
};
/** Graph validation settings. */
export type GraphConfig = {
    warn_orphans: boolean;
    warn_fanout_above: number;
    detect_cycles: boolean;
    detect_duplicates: boolean;
};
/** Top-level .skill-lint.yaml configuration. */
export type Config = {
    skills_root: string;
    default_level: number;
    levels: LevelOverrides;
    tools: ToolsConfig;
    models: string[];
    limits: LimitsConfig;
    prefixes: string | Record<string, string>;
    ignore: string[];
    graph: GraphConfig;
};
//# sourceMappingURL=types.d.ts.map