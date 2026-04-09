"""Deterministic state machine for the external orchestration loop."""

from __future__ import annotations

import logging
from typing import Callable

try:
    from .models import RunContext, State
except ImportError:
    from models import RunContext, State

logger = logging.getLogger(__name__)


TRANSITIONS: dict[State, list[State]] = {
    State.INIT: [State.PRECHECK],
    State.PRECHECK: [State.LAUNCH],
    State.LAUNCH: [State.WARMUP_OBSERVE],
    State.WARMUP_OBSERVE: [State.ACTIVE_MONITOR],
    State.ACTIVE_MONITOR: [State.SUCCESS_HOLD, State.FAILURE_DETECTED],
    State.SUCCESS_HOLD: [State.STOP_SUCCESS],
    State.STOP_SUCCESS: [State.DONE],
    State.FAILURE_DETECTED: [State.SNAPSHOT_PRE_STOP],
    State.SNAPSHOT_PRE_STOP: [State.GRACEFUL_STOP],
    State.GRACEFUL_STOP: [State.SNAPSHOT_POST_STOP],
    State.SNAPSHOT_POST_STOP: [State.DIAGNOSE],
    State.DIAGNOSE: [State.PATCH_PLAN],
    State.PATCH_PLAN: [State.APPLY_PATCH],
    State.APPLY_PATCH: [State.VALIDATE_PATCH],
    State.VALIDATE_PATCH: [State.CLEANUP],
    State.CLEANUP: [State.RELAUNCH_DECISION],
    State.RELAUNCH_DECISION: [State.LAUNCH, State.ESCALATE_HUMAN],
    State.ESCALATE_HUMAN: [State.FAILED],
    State.DONE: [],
    State.FAILED: [],
}


class InvalidTransitionError(RuntimeError):
    pass


class StateMachine:
    def __init__(self, ctx: RunContext) -> None:
        self.ctx = ctx
        self.handlers: dict[State, Callable[[RunContext], State | None]] = {}
        self.history: list[dict[str, str]] = []

    def register(self, state: State, handler: Callable[[RunContext], State | None]) -> None:
        self.handlers[state] = handler

    def register_many(
        self,
        handlers: dict[State, Callable[[RunContext], State | None]],
    ) -> None:
        self.handlers.update(handlers)

    def transition(self, target: State, reason: str = "") -> None:
        if target not in TRANSITIONS[self.ctx.state]:
            raise InvalidTransitionError(
                f"invalid transition: {self.ctx.state.value} -> {target.value}"
            )
        self.history.append(
            {"from": self.ctx.state.value, "to": target.value, "reason": reason}
        )
        logger.info("state transition %s -> %s", self.ctx.state.value, target.value)
        self.ctx.state = target

    def step(self) -> bool:
        if self.ctx.state in {State.DONE, State.FAILED}:
            return False
        handler = self.handlers.get(self.ctx.state)
        if handler is None:
            raise RuntimeError(f"missing handler for state {self.ctx.state.value}")
        next_state = handler(self.ctx)
        if next_state is not None:
            self.transition(next_state)
        return self.ctx.state not in {State.DONE, State.FAILED}

    def run_to_completion(self) -> State:
        while self.step():
            pass
        return self.ctx.state

