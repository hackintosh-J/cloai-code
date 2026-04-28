---
name: doc-writer
description: Generate README, API docs, or user guides for code and projects. Use when writing documentation, creating a README, documenting an API, or explaining how code works for others.
---

# Doc Writer: Generate Documentation

Create clear, well-structured documentation for the specified code, project, or topic.

## Process

### Step 1: Understand the Target

- If a file/project path is given, read the code first using Read/Glob tools
- Identify the audience (developers, end users, API consumers)
- Understand the scope (single function, module, full project)

### Step 2: Generate Documentation

Choose the appropriate format:

**For a Project (README)**
- Project name and one-line description
- Features list
- Quick start / installation instructions
- Usage examples with code blocks
- Configuration options (if any)
- License info

**For an API / Module**
- Overview of what it does
- Function/method signatures with parameter descriptions
- Return values and error cases
- Usage examples for common scenarios
- Edge cases or important notes

**For a User Guide**
- Step-by-step instructions
- Common workflows
- FAQ / troubleshooting section

### Writing Style

- Lead with the most important information
- Use code examples liberally — show, don't just tell
- Keep sentences short and scannable
- Use tables for parameter/option lists
- Use admonitions (Note, Warning, Tip) sparingly but effectively
- Write in the user's language (match their input language)
