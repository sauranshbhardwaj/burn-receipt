# burn-receipt

One command reads your local Claude Code and Codex history and prints a receipt: what your usage would have cost at API prices, where it went, and how much was avoidable.

```bash
npx burn-receipt
```

![example receipt](https://burnreceipt.dev/example.png)

## Options

```
--days <n>               Days to look back (default 7, max 365)
--claude-plan <plan>     pro | max5x | max20x | api (remembered after the first run)
--codex-plan-price <usd> Monthly price of your ChatGPT plan, if it can't be detected
--out <file.png>         Where to save the image
--no-image               Print only
--share                  Upload the receipt's numbers and get a link with a preview card
--json                   Print the receipt data as JSON
```

## Privacy

- Reads `~/.claude/projects` and `~/.codex/sessions` (or `$CLAUDE_CONFIG_DIR` / `$CODEX_HOME`) locally.
- Nothing leaves your machine unless you pass `--share`.
- `--share` sends only numbers and fixed labels, checked against a strict schema: no prompts, paths, project names or session ids. Shared receipts can appear on the public board. IPs are never stored, only a keyed hash for rate limiting.

## Accuracy

Prices are from Anthropic's and OpenAI's public pricing pages; the date is printed on every receipt. Where Claude Code records its own session cost, the numbers match to the cent. Some background calls aren't logged, so the total can be slightly low, never high. It's an estimate, not a bill.

## License

MIT
