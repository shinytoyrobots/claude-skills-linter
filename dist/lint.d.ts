/**
 * Orchestrator — wires the full lint pipeline end-to-end.
 * CLI args → loadConfig → detectFormat → extractAll → validateFrontmatter + validateManifest → report → exit code
 */
/** Options passed from the CLI to the lint orchestrator. */
export interface LintOptions {
    paths?: string[];
    level: number;
    changedOnly: boolean;
    base: string;
    format: 'terminal' | 'json' | 'github';
    strict: boolean;
    ratchet: boolean;
}
/**
 * Run the lint pipeline and return an exit code.
 * Exit codes: 0 = clean, 1 = errors (or warnings with --strict), 2 = config/git error (caller).
 */
export declare function runLint(options: LintOptions): Promise<number>;
//# sourceMappingURL=lint.d.ts.map