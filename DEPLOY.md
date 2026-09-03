# Deploying QuizArena

The app is two processes:

| Process | What it is | Needs |
|---|---|---|
| `server/` | Express + Socket.IO. Owns the clock, the scoring, and every live room. | A host that keeps a **long-lived WebSocket** open and does **not** sleep. |
| `client/` | Next.js. Just a UI — all state lives on the server. | Anything that runs Node, or any static-ish Next host. |

**The one hard constraint:** the server is *stateful and persistent*. Rooms live in
process memory, which is what makes answer handling sub-millisecond. That rules out
serverless/edge functions (Vercel Functions, Netlify Functions, Cloudflare Workers) for
`server/` — they cannot hold a WebSocket open for a 20-minute quiz. The client can go
anywhere; the server needs a real, always-on container or VM.

Pick one of the four below.

---

## Option 1 — Show someone today, from your own laptop

No hosting account, no deploy. Good for "can you look at this in five minutes".

```bash
cd server && npm start
```
```bash
cd client && npm run build && npm start
```
```bash
node scripts/preview-prod.mjs
```

That puts both behind **one origin** on `http://localhost:8080` — the same shape as a
real deployment. Then expose that one port:

```bash
npx cloudflared tunnel --url http://localhost:8080
```

Cloudflare prints a public `https://something.trycloudflare.com` URL that works on any
phone, anywhere, with working WebSockets and HTTPS. Hand it to the class.

Set the server's allowed origin to that URL before you start it, or students will be
blocked by CORS:

```bash
cd server && CLIENT_ORIGIN=https://something.trycloudflare.com npm start
```

> The tunnel dies when you close the terminal and the URL changes each time. It is a
> demo tool, not hosting. Your laptop also has to stay awake and on the network.

---

## Option 2 — Free hosting (Netlify + Render, £0)

### Why it has to be two hosts

**Netlify cannot host the server.** Netlify Functions are serverless: they run per-request
and shut down. A quiz holds one WebSocket open for the whole lesson, so there is nothing
for the server to run on there. The same applies to Vercel Functions and Cloudflare
Workers.

That is not a problem — it just means two free accounts:

| Half | Host | Why |
|---|---|---|
| `client/` | **Netlify** (free) | Static-ish Next.js. Exactly what Netlify is for. |
| `server/` | **Render** free web service | Free, no card, and it does support WebSockets. |

### Step 1 — the server, on Render

1. Push the repo to GitHub.
2. Render → **New** → **Web Service** → pick the repo.
3. Set **Root Directory** to `server`, build `npm ci`, start `npm start`.
   (Or use **New → Blueprint**, which reads the included `render.yaml` and does this
   for you.)
4. Leave `CLIENT_ORIGIN` unset for now — you do not know the Netlify URL yet.
5. Deploy. Note the URL, e.g. `https://quizarena-server.onrender.com`.

Check it: `curl https://quizarena-server.onrender.com/api/health` → `{"status":"ok",…}`

### Step 2 — the client, on Netlify

1. Netlify → **Add new site** → **Import an existing project** → same repo.
2. It reads the included `netlify.toml`, so the build settings are already right
   (base `client`, publish `.next`).
3. Add one environment variable, **Site settings → Environment variables**:
   `NEXT_PUBLIC_SERVER_URL` = your Render server URL from step 1.
4. Deploy. Note the URL, e.g. `https://quizarena.netlify.app`.

### Step 3 — introduce them

Back on Render, set `CLIENT_ORIGIN` = `https://quizarena.netlify.app` and let it redeploy.
That is the CORS/Socket.IO allowlist; without it every student is refused.

If you ever change `NEXT_PUBLIC_SERVER_URL`, **redeploy Netlify** — it is compiled into
the JavaScript at build time, so an env-var change alone does nothing.

### What "free" actually costs you here

Render's free web service **spins down after 15 minutes with no inbound traffic**, and
takes about a minute to wake. Two things make that livable, and one thing does not:

- **WebSocket messages count as inbound traffic.** Once a class is connected and playing,
  the service stays awake on its own. It will not die mid-quiz.
- **Wake it before the lesson.** Open the host page (or `curl` the health endpoint) a
  couple of minutes before class. First hit takes ~60s; after that it is warm.
- **The first student to arrive at a cold service waits.** If the teacher has not warmed
  it, the join screen sits on "Connecting…" for up to a minute. Warm it first.

Render's free filesystem is also ephemeral, which does not matter here — nothing is
persisted anyway; download the gradebook CSV before you close the tab.

**Koyeb** is the main free alternative (one free service, WebSockets supported, also
scale-to-zero). It asks for a card for fraud checks even though it does not charge.
**Railway and Fly.io no longer have a usable free tier** for new accounts.

> Free-tier terms change often. Check the current
> [Render free plan docs](https://render.com/docs/free) before relying on any of the
> numbers above.

### When to stop being free

If you are running this for actual lessons, put the **server** on Render's cheapest paid
instance (~$7/mo). That removes spin-down entirely and is the single upgrade that matters.
The Netlify client can stay free forever.

---

## Option 3 — One VPS, one domain, one command (recommended for a school)

Any $5/mo box (Hetzner, DigitalOcean, Linode) with Docker installed. This is the setup I
would run for real: everything on **one origin**, so there is no CORS to get wrong and no
rebuild needed to change domains.

1. Point a DNS **A record** at the server's IP, e.g. `quiz.yourschool.org`.
2. Copy the repo onto the box.
3. Run:

```bash
SITE_ADDRESS=quiz.yourschool.org PUBLIC_ORIGIN=https://quiz.yourschool.org docker compose up -d --build
```

That is it. Caddy fetches a real Let's Encrypt certificate automatically, serves the app
at `https://quiz.yourschool.org`, and forwards `/api` and `/socket.io` to the quiz
server. Students go to `https://quiz.yourschool.org/join`.

Leave `SITE_ADDRESS` unset to trial it at `http://localhost` first.

```bash
docker compose logs -f          # watch
docker compose up -d --build    # deploy a change
docker compose down             # stop
```

**Why one origin matters:** the client image is built with `NEXT_PUBLIC_SERVER_URL`
empty, so it talks to whatever host it is served from. The same image runs on localhost,
a staging domain and production without rebuilding — and there is no CORS configuration
to get subtly wrong at 9am on a Monday.

---

## Option 4 — Vercel for the client

Same shape as Option 2, swapping Netlify for Vercel:

- Deploy `client/` to Vercel with **Root Directory** `client`, and set
  `NEXT_PUBLIC_SERVER_URL` to your server's public HTTPS URL.
- Deploy `server/` to Render / Koyeb / a VPS, and set `CLIENT_ORIGIN` to the Vercel URL.

Do **not** try to run `server/` as Vercel serverless functions. It will appear to work
in a two-person test and fall over the moment a real class connects — functions cannot
hold a WebSocket open.

---

## Environment variables

### `server/`

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | Defaults to 4000. Most platforms inject this. |
| `CLIENT_ORIGIN` | **yes in production** | The origin the *browser* is on. Gates CORS **and** Socket.IO. Comma-separate several. `*` allows any origin — fine for a demo, but it lets any website open sockets against your rooms. |
| `NODE_ENV` | recommended | `production` |
| `ANTHROPIC_API_KEY` | no | Turns `/api/generate` from an editable scaffold into real Claude-generated questions. |
| `REDIS_URL` | no | Only to run more than one server process — see Scaling. |

### `client/`

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SERVER_URL` | only for split hosting | The server's public URL. **Leave empty** behind a reverse proxy (Option 3) so the client uses its own origin. **Baked in at build time** — changing it requires a rebuild, not just a restart. |
| `BUILD_STANDALONE` | no | `true` emits Next's self-contained bundle, which the Dockerfile needs. Leave unset on Netlify/Vercel/Render — their adapters expect a normal build and a standalone one makes every route 404. |

---

## Checking a deployment actually works

```bash
curl https://your-domain/api/health
# {"status":"ok","uptimeSec":42,"memoryMb":18,"rooms":0,"players":0,"sockets":0}
```

Then, in the browser on the deployed site, open the host page and look at the top-right
status dot:

- **green with a millisecond figure** — WebSocket connected and the clock is synced. Good.
- **amber "reconnecting"** — the socket is not staying up. Usually `CLIENT_ORIGIN` does
  not match the site's origin, or something between you and the server is stripping the
  WebSocket upgrade.
- **grey/"connecting" forever** — `NEXT_PUBLIC_SERVER_URL` points somewhere wrong, or the
  server is asleep (free tiers).

Open devtools → Network → WS. There should be **one** `socket.io` connection in
`101 Switching Protocols`. If you instead see a stream of repeating XHR requests, the
WebSocket upgrade is being blocked and everyone has silently fallen back to long-polling —
the room still works but feels sluggish. Fix the proxy rather than living with it.

---

## Scaling past one server process

One Node process comfortably handles a few hundred players in a room (measured: 200
students, p95 3 ms). Before adding processes, add RAM — rooms are small and in-memory.

If you genuinely need more than one:

1. Set `REDIS_URL`; the Socket.IO Redis adapter attaches automatically at boot.
2. Configure **sticky sessions on the PIN** at your load balancer. Rooms live in the
   memory of one process, so every socket for a given room must land on the same node.

Uncomment the `redis` service in `docker-compose.yml` if you are self-hosting.

---

## Things worth knowing before a real lesson

- **Full-screen enforcement needs HTTPS.** The Fullscreen API is unavailable on plain
  `http://` origins other than localhost. Every option above except bare-HTTP localhost
  gives you HTTPS.
- **Rooms are ephemeral by design.** A server restart drops every live room. Deploy
  between lessons, not during one.
- **Nothing is persisted.** Download the gradebook CSV from the results screen before you
  close the tab; there is no database behind it yet.
- **School networks.** Some block non-standard ports and inspect WebSockets. Options 2–4
  all serve over 443, which is the one that reliably gets through.
