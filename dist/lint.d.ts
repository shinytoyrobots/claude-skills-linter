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
 *
 * Exit codes:
 *   0 — no errors (or only warnings without --strict)
 *   1 — validation errors found (or warnings with --strict)
 *
 * ConfigError is NOT caught here — the caller (cli.ts) handles it for exit code 2.
 */
export declare function runLint(options: LintOptions): Promise<number>;
//# sourceMappingURL=lint.d.ts.map