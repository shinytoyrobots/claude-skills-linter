/**
 * Config loader for .skill-lint.yaml files.
 * Loads user configuration and deep-merges with defaults.
 */
import type { Config } from './types.js';
/** Error thrown when the config file contains invalid YAML. */
export declare class ConfigError extends Error {
    constructor(message: string);
}
/** Returns a fresh copy of the default configuration. */
export declare function getDefaults(): Config;
/**
 * Load configuration from .skill-lint.yaml in the given root directory.
 * Returns defaults if the file is missing or empty.
 * Throws ConfigError if the file contains invalid YAML.
 * Unknown keys are silently ignored.
 */
export declare function loadConfig(rootDir: string): Config;
//# sourceMappingURL=config.d.ts.map