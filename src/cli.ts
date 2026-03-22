import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runLint } from './lint.js';
import { runGraph } from './graph.js';
import { ConfigError } from './config.js';
import { ChangedFilesError } from './changed-files.js';

const cli = yargs(hideBin(process.argv))
  .scriptName('skill-lint')
  .usage('$0 <command> [options]')
  .command(
    'lint [paths..]',
    'Validate skill files for structural correctness',
    (yargs) =>
      yargs
        .positional('paths', {
          describe: 'File or directory paths to lint',
          type: 'string',
          array: true,
        })
        .option('level', {
          alias: 'l',
          describe: 'Quality level to enforce (0-3)',
          type: 'number',
          default: 0,
        })
        .option('changed-only', {
          describe: 'Only lint files changed since base ref',
          type: 'boolean',
          default: false,
        })
        .option('base', {
          describe: 'Git base ref for --changed-only',
          type: 'string',
          default: 'origin/main',
        })
        .option('format', {
          alias: 'f',
          describe: 'Output format',
          choices: ['terminal', 'json', 'github'] as const,
          default: 'terminal' as const,
        })
        .option('strict', {
          describe: 'Treat warnings as errors',
          type: 'boolean',
          default: false,
        })
        .option('ratchet', {
          describe: 'Enforce anti-regression (never go below current level)',
          type: 'boolean',
          default: false,
        }),
    async (argv) => {
      try {
        const exitCode = await runLint({
          paths: argv.paths as string[] | undefined,
          level: argv.level,
          changedOnly: argv.changedOnly,
          base: argv.base,
          format: argv.format,
          strict: argv.strict,
          ratchet: argv.ratchet,
        });
        process.exit(exitCode);
      } catch (err) {
        if (err instanceof ConfigError || err instanceof ChangedFilesError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        throw err;
      }
    },
  )
  .command(
    'graph [paths..]',
    'Validate cross-file references and dependency graph',
    (yargs) =>
      yargs
        .positional('paths', {
          describe: 'File or directory paths to analyze',
          type: 'string',
          array: true,
        })
        .option('format', {
          alias: 'f',
          describe: 'Output format',
          choices: ['terminal', 'json', 'github'] as const,
          default: 'terminal' as const,
        })
        .option('strict', {
          describe: 'Treat warnings as errors',
          type: 'boolean',
          default: false,
        }),
    async (argv) => {
      try {
        const exitCode = await runGraph({
          paths: argv.paths as string[] | undefined,
          format: argv.format,
          strict: argv.strict,
        });
        process.exit(exitCode);
      } catch (err) {
        if (err instanceof ConfigError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        throw err;
      }
    },
  )
  .command(
    'promote <path>',
    'Promote a skill file to the next quality level',
    (yargs) =>
      yargs.positional('path', {
        describe: 'Path to the skill file to promote',
        type: 'string',
        demandOption: true,
      }),
    () => {
      // Stub handler — exits 0
      process.exit(0);
    },
  )
  .command(
    'init',
    'Create a .skill-lint.yaml configuration file',
    () => {},
    () => {
      // Stub handler — exits 0
      process.exit(0);
    },
  )
  .demandCommand(1, 'You must specify a command')
  .strict()
  .help()
  .alias('h', 'help')
  .alias('v', 'version');

await cli.parseAsync();
