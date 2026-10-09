# claude-plugins

notHide's Claude Code plugins, published as one marketplace. Each plugin lives in its own folder under `plugins/`.

| Plugin | What it does |
| --- | --- |
| [usage-line](plugins/usage-line) | A row under the prompt: model, effort, context fill against the autocompact threshold, and the 5-hour and weekly limits with their reset countdowns |
| [less-slop](plugins/less-slop) | Appends the rules in its `prompt.md` to the system prompt of every session (main thread; subagents keep their own prompt), as `--append-system-prompt-file` would. Edit `prompt.md` to change them |

## Install

In a Claude Code terminal session:

```
/plugin install usage-line --marketplace notHide/claude-plugins
/plugin install less-slop --marketplace notHide/claude-plugins
```

Answer `y` to add the marketplace, then pick the user scope. Each plugin is active at once and in every later session. A new system prompt section takes effect from the next request.

Or from a shell:

```sh
claude plugin marketplace add notHide/claude-plugins
claude plugin install usage-line@notHide
claude plugin install less-slop@notHide
```

## Update

```sh
claude plugin marketplace update notHide
claude plugin update usage-line@notHide
claude plugin update less-slop@notHide
```

Then run `/reload-plugins` in an open session.

## Develop

Run a plugin from its folder instead of the installed copy:

```sh
claude --plugin-dir plugins/usage-line
claude plugin validate plugins/usage-line
claude plugin test plugins/usage-line
```

Plugins use Claude Code's function-hooks API (early access), so they need a recent Claude Code; they were built against 2.1.295.

## Adding a plugin

1. Put it in `plugins/<name>/`, with its own `.claude-plugin/plugin.json`.
2. Add `{ "name": "<name>", "source": "./plugins/<name>", "description": "..." }` to `plugins` in `.claude-plugin/marketplace.json`.
3. `claude plugin validate .` and `claude plugin validate plugins/<name>`.
