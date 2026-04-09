import { io } from "socket.io-client";

const SERVER = "http://localhost:5001";

async function getToken(username, password) {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).token;
}

function connectSocket(token) {
  return io(SERVER, { auth: { token }, transports: ["websocket"] });
}

async function main() {
  console.log("=== Rematch Flow Test ===\n");

  const token1 = await getToken("v2_tester1", "test123456");
  const token2 = await getToken("v2_tester2", "test123456");

  const s1 = connectSocket(token1);
  const s2 = connectSocket(token2);
  await Promise.all([
    new Promise(r => s1.on("connect", r)),
    new Promise(r => s2.on("connect", r)),
  ]);

  // Create and join room
  const { roomCode } = await new Promise(r => s1.emit("room:create", r));
  await new Promise(r => s2.emit("room:join", { roomCode }, r));
  console.log("✓ Room", roomCode, "created and joined");

  // Wait for game to finish (collision will happen naturally as snakes move toward each other)
  const finishedPromise = new Promise(resolve => {
    s1.on("room:update", state => {
      if (state.status === "finished") resolve(state);
    });
    // Timeout: if no collision in 15s, force by leaving
    setTimeout(() => {
      s1.emit("room:leave");
    }, 15000);
  });

  const finished = await finishedPromise;
  console.log("✓ Game finished. Winner:", finished.winner?.username || "draw", "Reason:", finished.reason);

  // Now test rematch WITHOUT leaving
  let rematchNotified = false;
  s2.on("rematch:requested", () => { rematchNotified = true; });

  // Player 1 requests rematch (stays in room)
  s1.emit("rematch:request");
  await new Promise(r => setTimeout(r, 500));
  console.log("  P1 requested rematch. P2 notified:", rematchNotified);

  // Listen for new game start
  const newGamePromise = new Promise(resolve => {
    s1.on("room:update", state => {
      if (state.status === "countdown") resolve(state);
    });
    setTimeout(() => resolve(null), 5000);
  });

  // Player 2 requests rematch
  s2.emit("rematch:request");
  const newGame = await newGamePromise;

  if (newGame) {
    console.log("✓ REMATCH STARTED! Status:", newGame.status, "Countdown:", newGame.countdown);
    console.log("  Snakes:", newGame.snakes.length, "Food:", !!newGame.food);
  } else {
    console.log("✗ REMATCH FAILED - did not start");
  }

  s1.disconnect();
  s2.disconnect();
  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
