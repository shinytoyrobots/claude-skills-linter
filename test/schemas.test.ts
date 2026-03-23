import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(__dirname, "..", "schemas");

const commandSchema = JSON.parse(
  readFileSync(resolve(schemasDir, "command.schema.json"), "utf-8")
);
const agentSchema = JSON.parse(
  readFileSync(resolve(schemasDir, "agent.schema.json"), "utf-8")
);
const skillSchema = JSON.parse(
  readFileSync(resolve(schemasDir, "skill.schema.json"), "utf-8")
);

// Draft-07 meta-schema for validating our schemas themselves
const DRAFT_07_META_SCHEMA_URL =
  "http://json-schema.org/draft-07/schema#";

const ajv = new Ajv({ allErrors: true });

// ─── AC-7: Both schemas validate against JSON Schema draft-07 meta-schema ───

describe("schema meta-validation (AC-7)", () => {
  it("command.schema.json is valid draft-07", () => {
    const valid = ajv.validateSchema(commandSchema);
    assert.equal(valid, true, `Meta-schema errors: ${JSON.stringify(ajv.errors)}`);
  });

  it("agent.schema.json is valid draft-07", () => {
    const valid = ajv.validateSchema(agentSchema);
    assert.equal(valid, true, `Meta-schema errors: ${JSON.stringify(ajv.errors)}`);
  });

  it("command.schema.json declares draft-07 $schema", () => {
    assert.equal(commandSchema.$schema, DRAFT_07_META_SCHEMA_URL);
  });

  it("agent.schema.json declares draft-07 $schema", () => {
    assert.equal(agentSchema.$schema, DRAFT_07_META_SCHEMA_URL);
  });
});

// ─── AC-1, AC-5: Command schema — required fields ───

describe("command.schema.json — required fields (AC-1, AC-5)", () => {
  const validate = ajv.compile(commandSchema);

  it("valid command passes", () => {
    const data = {
      description: "A valid command",
      model: "sonnet",
      "argument-hint": "<file-path>",
      "allowed-tools": ["Read", "Write"],
    };
    assert.equal(validate(data), true);
  });

  it("minimal valid command (description only) passes", () => {
    const data = { description: "Minimal command" };
    assert.equal(validate(data), true);
  });

  it("missing description fails", () => {
    const data = { model: "sonnet" };
    assert.equal(validate(data), false);
    assert.ok(validate.errors);
    const paths = validate.errors.map((e) => e.params?.missingProperty ?? e.instancePath);
    assert.ok(
      paths.some((p) => p === "description" || p.includes("description")),
      `Expected error about 'description', got: ${JSON.stringify(validate.errors)}`
    );
  });

  it("empty object fails (missing description)", () => {
    assert.equal(validate({}), false);
  });
});

// ─── AC-2: Command schema — optional field type validation ───

describe("command.schema.json — optional field types (AC-2)", () => {
  const validate = ajv.compile(commandSchema);

  it("description as number fails", () => {
    const data = { description: 123 };
    assert.equal(validate(data), false);
  });

  it("argument-hint as number fails", () => {
    const data = { description: "ok", "argument-hint": 42 };
    assert.equal(validate(data), false);
  });

  it("model as number fails", () => {
    const data = { description: "ok", model: 123 };
    assert.equal(validate(data), false);
  });

  it("allowed-tools as string passes (space-delimited format)", () => {
    const data = { description: "ok", "allowed-tools": "Read" };
    assert.equal(validate(data), true);
  });

  it("allowed-tools with non-string items fails", () => {
    const data = { description: "ok", "allowed-tools": [1, 2, 3] };
    assert.equal(validate(data), false);
  });

  it("allowed-tools as number fails", () => {
    const data = { description: "ok", "allowed-tools": 42 };
    assert.equal(validate(data), false);
  });

  it("correct types pass", () => {
    const data = {
      description: "valid",
      "argument-hint": "<hint>",
      model: "opus",
      "allowed-tools": ["Read", "Write"],
    };
    assert.equal(validate(data), true);
  });
});

// ─── AC-3, AC-5: Agent schema — required fields ───

describe("agent.schema.json — required fields (AC-3, AC-5)", () => {
  const validate = ajv.compile(agentSchema);

  it("valid agent passes", () => {
    const data = {
      name: "test-agent",
      description: "A valid agent",
      model: "opus",
      tools: ["Read", "Write", "Bash"],
    };
    assert.equal(validate(data), true);
  });

  it("minimal valid agent (name + description only) passes", () => {
    const data = { name: "minimal-agent", description: "Minimal" };
    assert.equal(validate(data), true);
  });

  it("missing name fails", () => {
    const data = { description: "Agent without name" };
    assert.equal(validate(data), false);
    assert.ok(validate.errors);
    const paths = validate.errors.map((e) => e.params?.missingProperty ?? e.instancePath);
    assert.ok(
      paths.some((p) => p === "name" || p.includes("name")),
      `Expected error about 'name', got: ${JSON.stringify(validate.errors)}`
    );
  });

  it("missing description fails", () => {
    const data = { name: "agent-no-desc" };
    assert.equal(validate(data), false);
    assert.ok(validate.errors);
    const paths = validate.errors.map((e) => e.params?.missingProperty ?? e.instancePath);
    assert.ok(
      paths.some((p) => p === "description" || p.includes("description")),
      `Expected error about 'description', got: ${JSON.stringify(validate.errors)}`
    );
  });

  it("empty object fails (missing name and description)", () => {
    assert.equal(validate({}), false);
    assert.ok(validate.errors);
    assert.ok(validate.errors.length >= 2, "Should have at least 2 errors");
  });
});

// ─── AC-4: Agent schema — optional field type validation ───

describe("agent.schema.json — optional field types (AC-4)", () => {
  const validate = ajv.compile(agentSchema);

  it("tools as string fails", () => {
    const data = { name: "a", description: "b", tools: "Read, Write" };
    assert.equal(validate(data), false);
  });

  it("tools with non-string items fails", () => {
    const data = { name: "a", description: "b", tools: [1, 2] };
    assert.equal(validate(data), false);
  });

  it("model as number fails", () => {
    const data = { name: "a", description: "b", model: 42 };
    assert.equal(validate(data), false);
  });

  it("correct optional types pass", () => {
    const data = {
      name: "agent",
      description: "desc",
      tools: ["Read", "Bash"],
      model: "sonnet",
    };
    assert.equal(validate(data), true);
  });
});

// ─── AC-6: additionalProperties allowed ───

describe("additionalProperties: true (AC-6)", () => {
  it("command allows extra fields", () => {
    const validate = ajv.compile(commandSchema);
    const data = {
      description: "Valid command",
      "custom-field": "custom-value",
      "x-internal": true,
      priority: 5,
    };
    assert.equal(validate(data), true);
  });

  it("agent allows extra fields", () => {
    const validate = ajv.compile(agentSchema);
    const data = {
      name: "agent",
      description: "Valid agent",
      isolation: "worktree",
      background: true,
      memory: "project",
      mcpServers: ["context7", "github"],
      disallowedTools: ["Write", "Edit"],
    };
    assert.equal(validate(data), true);
  });
});

// ─── AC-8: Context files skip schema validation ───

describe("context type — no schema (AC-8)", () => {
  it("no context schema exists (context files skip schema validation)", () => {
    // Context files live in commands/context/ and have no frontmatter schema.
    // Validation is graph-level only. We verify no context schema file exists.
    let contextSchemaExists = true;
    try {
      readFileSync(resolve(schemasDir, "context.schema.json"), "utf-8");
    } catch {
      contextSchemaExists = false;
    }
    assert.equal(
      contextSchemaExists,
      false,
      "context.schema.json should NOT exist — context files skip schema validation"
    );
  });
});

// ─── Field name verification against real skill files ───

describe("field names match real skill files", () => {
  it("command schema uses hyphenated field names (argument-hint, allowed-tools)", () => {
    assert.ok("argument-hint" in commandSchema.properties);
    assert.ok("allowed-tools" in commandSchema.properties);
  });

  it("agent schema uses 'tools' (not 'allowed-tools')", () => {
    assert.ok("tools" in agentSchema.properties);
    assert.ok(!("allowed-tools" in agentSchema.properties));
  });

  it("command schema does NOT have 'tools' field", () => {
    assert.ok(!("tools" in commandSchema.properties));
  });

  it("agent schema does NOT have 'allowed-tools' field", () => {
    assert.ok(!("allowed-tools" in agentSchema.properties));
  });

  it("skill schema has 'allowed-tools' field", () => {
    assert.ok("allowed-tools" in skillSchema.properties);
  });
});

// ─── Skill schema — allowed-tools oneOf validation ───

describe("skill.schema.json — allowed-tools", () => {
  const validate = ajv.compile(skillSchema);

  it("allowed-tools as array passes", () => {
    const data = { name: "my-skill", description: "desc", "allowed-tools": ["Read", "Write"] };
    assert.equal(validate(data), true);
  });

  it("allowed-tools as string passes (space-delimited format)", () => {
    const data = { name: "my-skill", description: "desc", "allowed-tools": "Read Write Bash" };
    assert.equal(validate(data), true);
  });

  it("allowed-tools as number fails", () => {
    const data = { name: "my-skill", description: "desc", "allowed-tools": 42 };
    assert.equal(validate(data), false);
  });
});
