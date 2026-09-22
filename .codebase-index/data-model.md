Data model and schemas

Primary data model: Markdown-based "skill" files with frontmatter and structured fields.

Schemas
- schemas/command.schema.json — schema for individual command frontmatter
- schemas/skill.schema.json — top-level skill file schema
- schemas/agent.schema.json — schema for agent/command definitions used by some plugins

How schemas are used
- Validation modules (src/validate-frontmatter.ts, src/validate-manifest.ts) load and validate parsed frontmatter against these JSON Schemas.
- Tests under test/ include fixtures (test/fixtures/*.md) demonstrating valid/invalid shapes used in test assertions.

Observed entities
- Skill: file-level entity with metadata (name, description, tags, commands, etc.)
- Command: nested entity representing a single command or agent, validated against command.schema.json

Notes
- Schemas are the authoritative source of truth for permitted fields and types; editing them changes validation behavior. Ensure changes are accompanied by tests and updated fixtures.
