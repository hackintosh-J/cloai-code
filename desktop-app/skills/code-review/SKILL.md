---
name: code-review
description: Thorough code review covering bugs, security, performance, and maintainability. Use when reviewing code, checking for bugs, auditing quality, or getting feedback on implementations.
---

# Code Review: Thorough Analysis of Code

Review the provided code or recent changes with a focus on correctness, maintainability, and best practices.

## Review Process

### Step 1: Identify What to Review

- If the user provided a file path or pasted code, review that
- If no specific target, run `git diff` to find recent changes
- If no git changes, ask the user what to review

### Step 2: Read the Code

Use the Read tool to examine the full file(s). Understand the context — what does this code do? What's its role in the project?

### Step 3: Analyze

Check for these categories of issues:

**Bugs & Correctness**
- Logic errors, off-by-one errors, null/undefined handling
- Missing edge cases, race conditions
- Incorrect API usage or wrong assumptions
- Type mismatches or unsafe casts

**Security**
- SQL injection, XSS, command injection risks
- Hardcoded secrets or credentials
- Unsafe deserialization, path traversal
- Missing input validation at system boundaries

**Performance**
- Unnecessary loops or redundant computation
- N+1 query patterns, missing pagination
- Memory leaks (unclosed resources, growing collections)
- Blocking operations in async contexts

**Maintainability**
- Unclear naming, overly complex logic
- Missing error handling for external calls
- God functions/classes that do too many things
- Dead code or unreachable branches

### Step 4: Report

Present findings organized by severity:
1. **Critical** — Bugs or security issues that must be fixed
2. **Important** — Significant improvements for correctness or maintainability
3. **Suggestions** — Nice-to-have improvements

For each finding: state the issue, explain WHY it's a problem, and show the fix. Skip categories with no findings.

If the code is clean, say so — don't invent issues.
