# Demo

Three ways to see `doc-extract-agent` in action, from "no setup" to "real document".

## 1. No-API-key sample (instant)

Shows the output shape and the human-in-the-loop review UX using a stubbed model
response — no Anthropic key, no document needed:

```bash
npm install
npm run demo
```

You'll see a fully reconciled invoice plus a low-confidence `dueDate` flagged for
review (`needsReview: true`) — exactly what a reviewer would act on.

## 2. Record the GIF

The repo ships a [VHS](https://github.com/charmbracelet/vhs) tape that records the
sample run above into `docs/demo.gif`:

```bash
# one-time: install vhs (brew install vhs) — needs ffmpeg + ttyd
vhs demo.tape
```

Then reference `docs/demo.gif` from the README.

## 3. Real document (needs an API key)

```bash
cp .env.example .env        # set ANTHROPIC_API_KEY
npm run build
node dist/cli/index.js path/to/invoice.pdf --format csv

# or as a service:
npm run serve               # POST http://localhost:3000/extract
curl -s localhost:3000/extract \
  -H 'content-type: application/json' \
  -d "{\"fileName\":\"invoice.png\",\"base64\":\"$(base64 -i path/to/invoice.png)\"}" | jq
```
