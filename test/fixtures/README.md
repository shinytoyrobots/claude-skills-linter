# Test Fixtures

Fixture files for skill-lint validation tests. Each file represents a specific scenario for the linting pipeline.

## Fixture Inventory

### Valid Files (expect 0 errors)

| File | FileType | Story | Description |
|------|----------|-------|-------------|
| `valid-command.md` | command | 003, 005 | Well-formed command with all required frontmatter fields |
| `valid-agent.md` | agent | 003, 005 | Well-formed agent with all required frontmatter fields |

### Invalid Files (expect errors)

| File | FileType | Story | Expected Error |
|------|----------|-------|----------------|
| `missing-description.md` | command | 005 | Missing required `description` field |
| `missing-name.md` | agent | 005 | Missing required `name` field |
| `empty-body.md` | command | 005 | Frontmatter present but markdown body is empty |
| `no-frontmatter.md` | unknown | 003, 005 | No YAML frontmatter delimiter found |

### Edge Cases

| File | FileType | Story | Description |
|------|----------|-------|-------------|
| `legacy-agent.md` | legacy-agent | 003 | Agent file using legacy format (no structured frontmatter) |

## Usage

Fixtures are consumed by `node:test` suites. Import the fixture path and feed it through the extraction and validation pipeline.

## Adding Fixtures

When adding a fixture for a new story:
1. Add the file to this directory
2. Update this table with file name, expected FileType, owning story, and expected outcome
3. Ensure the fixture is minimal — include only the fields needed to trigger the expected behavior
