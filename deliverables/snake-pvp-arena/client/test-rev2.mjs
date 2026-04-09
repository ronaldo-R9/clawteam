import { io } from "socket.io-client";

const SERVER = "http://localhost:5001";

async function getToken(username, password) {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return data.token;
}

function connectSocket(token) {
  return io(SERVER, { auth: { token }, transports: ["websocket"] });
}

async function main() {
  console.log("=== Rev-2 Socket.IO Integration Test ===\n");

  const token1 = await getToken("v2_tester1", "test123456");
  const token2 = await getToken("v2_tester2", "test123456");
  console.log("✓ Tokens obtained");

  const s1 = connectSocket(token1);
  const s2 = connectSocket(token2);
  await Promise.all([
    new Promise((r) => s1.on("connect", r)),
    new Promise((r) => s2.on("connect", r)),
  ]);
  console.log("✓ Both connected");

  // Create room
  const createResult = await new Promise((r) => s1.emit("room:create", r));
  console.log("✓ Room created:", createResult.roomCode);
  const roomCode = createResult.roomCode;

  // Track all state updates
  const stateLog = [];
  s1.on("room:update", (state) => stateLog.push({ tick: state.tick, status: state.status, countdown: state.countdown }));

  // Join room - should trigger countdown
  const joinResult = await new Promise((r) => s2.emit("room:join", { roomCode }, r));
  console.log("✓ Player 2 joined, status:", joinResult.state?.status, "countdown:", joinResult.state?.countdown);

  // Wait for countdown to complete and game to start
  await new Promise((resolve) => {
    const check = (state) => {
      if (state.status === "playing") {
        s1.off("room:update", check);
        resolve(state);
      }
    };
    s1.on("room:update", check);
    // Timeout safety
    setTimeout(() => resolve(null), 8000);
  });
  
  const countdownStates = stateLog.filter(s => s.status === "countdown");
  const playingStates = stateLog.filter(s => s.status === "playing");
  console.log("✓ Countdown phases observed:", countdownStates.length, 
    "values:", countdownStates.map(s => s.countdown).join(","));
  console.log("✓ Game started, playing ticks so far:", playingStates.length);

  // Let game run a bit
  await new Promise(r => setTimeout(r, 1500));
  
  const finalPlayingCount = stateLog.filter(s => s.status === "playing").length;
  console.log("✓ Total game ticks received:", finalPlayingCount);

  // Player 1 leaves to end game
  s1.emit("room:leave");
  
  // Wait for finished state
  const finishedState = await new Promise((resolve) => {
    const check = (state) => {
      if (state.status === "finished") {
        s2.off("room:update", check);
        resolve(state);
      }
    };
    s2.on("room:update", check);
    setTimeout(() => resolve(null), 5000);
  });
  
  console.log("\n=== Game Result ===");
  console.log("  Status:", finishedState?.status);
  console.log("  Winner:", finishedState?.winner?.username);
  console.log("  Reason:", finishedState?.reason);

  // === Rematch Test ===
  console.log("\n=== Rematch Test ===");
  
  // Reconnect player 1 to the room
  const s1b = connectSocket(token1);
  await new Promise((r) => s1b.on("connect", r));
  
  const watchResult = await new Promise((r) => s1b.emit("room:watch", { roomCode }, r));
  console.log("  Player 1 reconnected to room:", watchResult.ok);

  // Track rematch events
  let rematchRequested = false;
  s2.on("rematch:requested", () => { rematchRequested = true; });

  // Player 1 requests rematch
  s1b.emit("rematch:request");
  await new Promise(r => setTimeout(r, 500));
  console.log("  Player 1 requested rematch, opponent notified:", rematchRequested);

  // Player 2 also requests rematch
  const rematchStartPromise = new Promise((resolve) => {
    const check = (state) => {
      if (state.status === "countdown" || state.status === "playing") {
        s2.off("room:update", check);
        resolve(state);
      }
    };
    s2.on("room:update", check);
    setTimeout(() => resolve(null), 5000);
  });

  s2.emit("rematch:request");
  const rematchState = await rematchStartPromise;
  
  if (rematchState) {
    console.log("✓ Rematch started! Status:", rematchState.status, "countdown:", rematchState.countdown);
  } else {
    console.log("⚠ Rematch did not start (timeout)");
  }

  // Verify persistence after game
  const statsRes = await fetch(`${SERVER}/api/stats/me`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  const stats = await statsRes.json();
  console.log("\n=== Persistence ===");
  console.log("  Wins:", stats.user.wins, "Losses:", stats.user.losses);
  console.log("  Matches:", stats.recentMatches.length);

  // Cleanup
  s1.disconnect(); s1b.disconnect(); s2.disconnect();
  console.log("\n=== ALL REV-2 TESTS COMPLETE ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
