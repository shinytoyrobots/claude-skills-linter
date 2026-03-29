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
export declare function runLint(options: LintOptions): Promise<number>;
//# sourceMappingURL=lint.d.ts.map