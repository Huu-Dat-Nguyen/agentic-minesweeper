<!-- Snapshot of the author's coding rules, copied 2026-10-26 for reference. The rewrite (v2) follows these. -->

# Coding Rules

Rules, patterns and design choices to follow when writing or changing code.
The user adds to this list over time; rules are in priority order.

## Rules

### 1. Avoid code duplication

- Before writing code, check if the same logic already exists in the project. Reuse or extend it instead of copying it.
- Logic needed in two or more places goes in one shared function or module that each caller imports.
- When copying a script as a template, import its shared helpers; never paste helper code into the copy.
- If you find existing duplication while working, point it out; refactor only when the user agrees.
- Why: one change should happen in one place. Copies drift apart, and fixes get missed.

### 2. Check what you can't see

- Before calling a function, read its definition or type to learn what it returns; never guess the shape from its name.
- Before changing what code writes (DB columns, CSV/JSON/result files, config keys), search for every reader of that data, not just callers of the function. Readers that only touch the file or table never show up in a call search.
- Before calling a helper inside a loop, check its cost; a helper that loops over the data again turns O(n) into O(n²).
- When a module writes a file or table that another module reads, note that link in the project's AGENTS.md (writer -> data -> readers).
- Why: AI sees only part of a codebase at a time. Bugs hide in links it can't see, like a report reading a table that a change silently altered.

### 3. Keep code and docs lean

- Write only what the task needs; no extra features, options or speculative abstractions.
- Delete dead code you touch (unused functions, imports, branches) and mention it in the summary.
- Keep AGENTS.md short; put the critical rules at the top, not buried in the middle.
- Why: less code means fewer hidden links and more of the system fits in context; models tend to miss details in the middle of long text.

## Patterns

Use a pattern when the problem in front of you matches its trigger below. Don't add one "just in case": in small scripts and plain-function code, simple code wins. Prefer the language's or framework's built-in form (e.g. DI `@Singleton`, Kotlin `Flow`, Python `dict` of functions) over hand-written boilerplate.

### Creational (how objects are made)

- **Singleton** - exactly one shared instance (logger, DB pool, config). Get it from DI or a module-level object, not a hand-rolled global; keep it mockable for tests. Never use it just to get global state.
- **Builder** - an object with many optional settings (roughly 5+ params, or step-by-step setup). Use chained setters, or named/default args where the language has them (Kotlin, Python).
- **Factory** - the same "if type X create A, else B" creation logic would appear in more than one place. Put it in one factory function or class.

### Structural (how objects fit together)

- **Facade** - callers would otherwise run the same multi-step sequence over several subsystems. Give them one simple call. Keep it thin; split it before it becomes a god object.
- **Adapter** - a third-party API or library doesn't match the shape or units your code expects. Wrap it once at the boundary; don't scatter conversions through the code.

### Behavioral (how objects interact)

- **Strategy** - several interchangeable ways to do the same job, chosen at runtime, especially an if/elif chain that keeps growing. Use an interface plus one class per option, or in Python a `dict` of functions. A short, fixed 2-3 branch chain can stay as is.
- **Observer** - other parts must react when something changes (state updates, events, monitoring). Use the platform's mechanism (Flow/StateFlow, LiveData, signals, callbacks). Avoid long event chains that trigger each other.

- Why: these are proven fixes for problems that recur; matching the trigger keeps them from becoming over-engineering. Source: Gang of Four (1994), summarized from a design-patterns video.

## Design

(none yet)
