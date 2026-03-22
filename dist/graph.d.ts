/**
 * Orchestrator — wires the full graph validation pipeline end-to-end.
 * CLI args → loadConfig → extractAll → validateGraph → report → exit code
 */
/** Options passed from the CLI to the graph orchestrator. */
export interface GraphOptions {
    paths?: string[];
    format: 'terminal' | 'github';
    strict: boolean;
}
/**
 * Run the graph validation pipeline and return an exit code.
 *
 * Exit codes:
 *   0 — no errors (or only warnings without --strict)
 *   1 — validation errors found (or warnings with --strict)
 *
 * ConfigError is NOT caught here — the caller (cli.ts) handles it for exit code 2.
 */
export declare function runGraph(options: GraphOptions): Promise<number>;
//# sourceMappingURL=graph.d.ts.map