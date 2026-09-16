# Tic Tac Toe

A draw-to-play tic-tac-toe game with local (pass-and-play) and anonymous room-code multiplayer modes. Frontend is a React + Vite SPA; multiplayer runs over a small authoritative WebSocket server.

## Local Development

**Frontend** (from the repo root):

```
npm install
npm run dev
```

**Server** (in a second terminal — only needed to test multiplayer):

```
cd server
npm install
npm run dev
```

By default the frontend expects the WebSocket server at `ws://localhost:8080` (see `.env.example`). Copy `.env.example` to `.env.local` to override it.

## Production

This is two separately deployed pieces:

- **Frontend** — a static Vite build (`npm run build` → `dist/`). Deploy `dist/` to any static host (Netlify, Vercel, S3+CloudFront, nginx, etc.). Local play works with the frontend alone.
- **Server** (`server/`) — a Node/WebSocket process. It must run on a host that supports long-lived WebSocket connections (a plain static host or a serverless function is not enough). It needs no database or persistent volume.

**Required environment variables:**

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_WS_URL` | Frontend build | The multiplayer server's WebSocket URL. Must use `wss://` in production — browsers refuse insecure `ws://` connections from an `https://` page. |
| `PORT` | Server | Port the server listens on. Most hosting platforms set this for you. |

Only variables prefixed `VITE_` are ever bundled into the frontend — never put server secrets in a `VITE_` variable.

**Build/start commands:**

```
# Frontend
npm run build        # outputs dist/
npm run preview      # optional: locally preview the production build

# Server
cd server
npm run typecheck    # tsc --noEmit
npm start            # runs the compiled-on-the-fly server via tsx (no build step)
```

**Hosting requirements for the server:** any Node host that keeps a long-running process and proxies WebSocket upgrade requests through (Fly.io, Render, Railway, a plain VM, etc.). Ensure your reverse proxy/load balancer forwards `Upgrade`/`Connection` headers and doesn't aggressively idle-timeout WebSocket connections faster than the app's own 30s heartbeat.

### Known architecture limitation: in-memory rooms

Multiplayer rooms (and all in-progress game state) are held **in server memory only**. There is no database or external store. This means:

- Restarting or redeploying the server drops every active room and match immediately.
- Multiplayer cannot be horizontally scaled across multiple server processes/instances — all players in a room must be connected to the same process.
- This is intentional for the current release, not an oversight. Adding persistence (e.g. Redis) is out of scope for this pass.

## Testing & Checks

```
npm run build          # frontend production build
npm run lint            # frontend lint (oxlint)

cd server
npx tsc --noEmit       # server type check
npm test               # server test suite
```
