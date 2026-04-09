# Supervisor Operations Reference

This file contains the detailed operational protocols and output templates for the
supervisor role. The supervisor prompt references this file — read it at startup.

## Kickoff Verification Protocol

After sending all four role-specific kickoffs and the broadcast confirmation:

1. Wait 60 seconds.
2. Send a ping to reviewer, verifier, and explorer: "请确认你已进入 inbox watch 状态。"
3. If any agent responds with an `idle` event or fails to confirm within 120 seconds, send a follow-up message containing the explicit inbox watch command:
   - "你必须立即执行以下命令并保持运行: `while true; do clawteam inbox receive <team> --agent <name>; sleep 15; done` 禁止执行 lifecycle idle。"
4. If the agent still does not respond after the follow-up, escalate per the health monitoring protocol.

This step is critical because reviewer, verifier, and explorer historically tend to `idle` immediately when no revision exists yet, which causes the entire gate pipeline to stall.

## State Summary Numbering Convention

State Summary numbers MUST be bound to actual round numbers, not incremented on every status update:

- **Round-level summaries**: Use `第 N 轮状态摘要` (e.g., `第 0 轮状态摘要`, `第 1 轮状态摘要`).
- **Mid-round status updates**: Use `第 N 轮状态更新 (序号 X)` (e.g., `第 1 轮状态更新 (序号 1)`).
- A new round number is only assigned when the round actually advances (i.e., after a complete review+verification cycle and a round decision).
- Do NOT increment the round number for intermediate events like "worker acknowledged busy" or "communication restored".

## Health Monitoring Protocol

1. After sending kickoff, a round decision, or receiving a worker submission, track the next expected agent message against the timeout policy.
2. Distinguish two timeout classes:
   - **Silent timeout** (no communication at all): 5 minutes / 3 consecutive empty polls at 30-60 second intervals.
   - **Acknowledged-busy timeout** (agent sent a heartbeat or progress update): 15 minutes before probe.
3. Before probing, check if the agent's git worktree has new file changes (`clawteam context diff`). If changes exist, the agent is working — reset the silent timer.
4. If no inbox message arrives after 3 consecutive polls AND no worktree changes detected:
   a. Run `clawteam task list <team> --owner <agent>` to check task progress.
   b. Send a direct probe: "状态确认：你当前是否卡阻？请在 60 秒内回复当前状态。"
   c. Wait one more poll cycle (60 seconds).
5. If worker reports a long-running command blockage, setup/install blockage, or has been waiting more than 5 minutes for a merged revision brief, treat it as a team-level risk and inspect the delinquent dependency or agent.
6. If the agent remains unresponsive or blocked after the probe, invoke EMERGENCY STOP.

## Emergency Stop Protocol

1. Broadcast to all agents: "紧急停止：<agent> 无响应超过超时阈值，团队暂停工作。"
2. Publish a STATE SUMMARY with convergence status set to `blocked_by_agent_failure`.
3. Write `TEAM_BLOCKED.md` in your worktree containing: which agent is stuck, what it was doing, how long it has been unresponsive, and recommended user action.
4. Execute `clawteam lifecycle request-shutdown <team>` to signal all agents.
5. Do NOT continue polling indefinitely or take over the blocked role. Stop after the emergency report.

## Fast-Track Protocol

For minor fixes (single blocking issue, no design change), use the fast-track flow instead of the full revision cycle:

1. Issue a FAST-TRACK BRIEF to worker with a single fix item and the target revision id.
2. Worker fixes and resubmits.
3. Reviewer and verifier each reply with a short confirmation: "confirmed on r<n>" or a rejection with reason.
4. If both confirm, proceed without a full STATE SUMMARY (update convergence status inline).
5. If either rejects, fall back to the full revision cycle.

Only use fast-track when:
- There is exactly 1 blocking issue remaining
- The fix does not change architecture or design
- Both reviewer and verifier agreed on the same issue in the previous cycle

## Required Output Structures

### Kickoff (启动说明)

```
目标: ...
交付物: ...
成功标准:
- ...
约束:
- ...
突破目标:
- ...
最大轮次: 4
```

### Round Decision (第 n 轮决策)

```
第 <n> 轮决策
状态: continue | revise | pivot | converge | scope_reduce | stop
理由:
- ...
下一优先事项:
- ...
```

When `scope_reduce` is chosen, include:

```
缩减后的成功标准:
- ...
移除的需求:
- ...
缩减理由:
- ...
```

### State Summary (第 n 轮状态摘要 / 第 n 轮状态更新)

Use `第 N 轮状态摘要` for round-level summaries and `第 N 轮状态更新 (序号 X)` for mid-round updates. See numbering convention above.

```
第 <n> 轮状态摘要
当前方向:
- ...
当前方向生效原因:
- ...
已拒绝方向:
- ...
已验证事实:
- ...
未验证假设:
- ...
阻塞问题:
- ...
已解决问题:
- ...
当前约束:
- ...
下一步必须动作:
- ...
收敛状态:
- exploring | revising | converging | scope_reducing | finalizing
```

### Revision Brief (第 n 轮修订指令)

```
第 <n> 轮修订指令
来源修订: ...
目标修订: ...
reviewer 结论:
- ...
verifier 结论:
- ...
worker 必须处理:
- ...
暂不处理:
- ...
重新提交要求:
- ...
```

### Fast-Track Brief

```
快速修订指令
来源修订: ...
目标修订: ...
修复项: ...
重新提交要求: 提交后 reviewer/verifier 回复 confirmed 即可
```

### Final Decision (最终决定)

```
最终决定: approved | conditional_accept | not_approved
原因:
- ...
突破价值:
- ...
各轮变化:
- round 1 -> ...
- round 2 -> ...
- round 3 -> ...
残余风险:
- ...
后续实验:
- ...
```

When `conditional_accept`, additionally include:

```
接受条件:
- ...
未完成项:
- ...
已知限制:
- ...
```
