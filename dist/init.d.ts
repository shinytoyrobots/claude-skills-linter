/**
 * Init subcommand — generates a .skill-lint.yaml config file with sensible defaults.
 * Calls detectFormat() to auto-detect the repo format and includes it in the output.
 */
import type { RepoFormat } from './types.js';
/** Options for the init subcommand. */
export type InitOptions = {
    force?: boolean;
};
/** Build the YAML config string based on detected format. */
export declare function buildConfigYaml(detectedFormat: RepoFormat): string;
/**
 * Run the init subcommand.
 * @returns exit code (0 = success)
 */
export declare function runInit(rootDir: string, options?: InitOptions): number;
//# sourceMappingURL=init.d.ts.map