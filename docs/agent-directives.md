# Agent Directives

Behavioral principles + mechanical overrides for working within constrained context windows and tool quirks. Behavioral principles come first (how to approach work), followed by mechanical overrides (tool-specific safeguards).

---

## Behavioral Principles

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Mechanical Overrides

You are operating within a constrained context window and strict system prompts. To produce production-grade code, you MUST adhere to these overrides:

### Verification

1. FORCED VERIFICATION: Your internal tools mark file writes as successful even if the code does not compile. You are FORBIDDEN from reporting a task as complete until you have:

- Run `npx tsc --noEmit` (or the project's equivalent type-check)

- Run `npx eslint . --quiet` (if configured)

- Fixed all errors **your changes caused**. Report (don't fix) pre-existing errors surfaced by your changes.

If no type-checker is configured, state that explicitly instead of claiming success.

### Context Management

2. SUB-AGENT SWARMING: For tasks touching >5 independent files, you MUST launch parallel sub-agents (5-8 files per agent). Each agent gets its own context window. This is not optional - sequential processing of large tasks guarantees context decay.

3. CONTEXT DECAY AWARENESS: After 10+ messages in a conversation, you MUST re-read any file before editing it. Do not trust your memory of file contents. Auto-compaction may have silently destroyed that context and you will edit against stale state.

4. FILE READ BUDGET: Each file read is capped at 2,000 lines. For files over 500 LOC, you MUST use offset and limit parameters to read in sequential chunks. Never assume you have seen a complete file from a single read.

5. TOOL RESULT BLINDNESS: Tool results over 50,000 characters are silently truncated to a 2,000-byte preview. If any search or command returns suspiciously few results, re-run it with narrower scope (single directory, stricter glob). State when you suspect truncation occurred.

### Edit Safety

6. EDIT INTEGRITY: Before EVERY file edit, re-read the file. After editing, read it again to confirm the change applied correctly. The Edit tool fails silently when old_string doesn't match due to stale context. Never batch more than 3 edits to the same file without a verification read.

7. NO SEMANTIC SEARCH: You have grep, not an AST. When renaming or

   changing any function/type/variable, you MUST search separately for:

   - Direct calls and references

   - Type-level references (interfaces, generics)

   - String literals containing the name

   - Dynamic imports and require() calls

   - Re-exports and barrel file entries

   - Test files and mocks

   Do not assume a single grep caught everything.

---

## Operational Notes

> Plugin-specific notes — separated from the rules above. These have no influence on the enforcement of Behavioral Principles or Mechanical Overrides.

### Compound Engineering — Learning Capture

Use `ce-compound` only. At the end of each task, invoke it to accumulate the learning into `docs/solutions/`. Do not use any other `ce-*` features.

### Superpowers — Standard Workflow

Follow this order when executing work:

1. `brainstorming`
2. `using-git-worktrees`
3. `writing-plans`
4. `subagent-driven-development` or `executing-plans`
5. `test-driven-development`
6. `requesting-code-review`
7. `finishing-a-development-branch`
