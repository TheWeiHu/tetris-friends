# Beepboop Arena

A keyboard-first falling-block battle for 2–6 friends. Create a private room, share its link, ready up, and outlast the room. Bots fill empty seats.

```sh
npm ci
npm start
```

Open `http://127.0.0.1:55030`. Use arrows to move, Up/X and Z to rotate, Space to drop, and C/Shift to hold. Music starts only when enabled. **Beepboop Bounce** adapts the original Bounce Protocol instrumental; **Puzzle Sprint** is an original minor-key arcade composition. Matches open with Puzzle Sprint, then alternate the two tracks. The composition source is in `scripts/compose-puzzle-sprint.py`.

Attacks cancel incoming garbage first, then distribute each remaining row to one opponent, favoring players with less recent pressure. Garbage waits 1.8 seconds and enters at most four rows at a time on non-clearing locks. Piece sequences are identical; gravity accelerates every 30 seconds.

The Node 22+ server owns all game rules, validates inputs, and streams snapshots over WebSockets. Clients predict their own inputs for responsiveness. Reconnecting within 20 seconds preserves a seat; gravity continues during disconnects. Rooms are temporary and are lost on server restart.

`npm test` checks rules, fairness, room ownership, reconnects, and HTTP/WebSocket behavior. `npm run test:browser` runs Chromium tests after `npx playwright install chromium`; screenshots go to `.context/`.

Hosting uses the service and Nginx templates in `deploy/`. Set `PORT`, `HOST`, and `PUBLIC_ORIGIN`; enable `TRUST_PROXY=1` only behind the supplied loopback proxy. Install Node 22+ at `/opt/beepboop-arena/node`, create the `beepboop-arena` service user, and install the service/environment files before running `deploy/push.sh`. The script deploys a committed release and rolls back if its health check fails. Never restart during an active match.
