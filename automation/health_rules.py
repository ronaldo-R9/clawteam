"""Deterministic health rules for external monitoring."""

from __future__ import annotations

try:
    from .models import Finding, MemberSnapshot, MonitorSnapshot, Severity
except ImportError:
    from models import Finding, MemberSnapshot, MonitorSnapshot, Severity

GATE_ROLES = ("reviewer", "verifier", "explorer")


def _gate_member(snapshot: MonitorSnapshot, role: str) -> MemberSnapshot | None:
    return snapshot.members.get(role)


def evaluate_snapshot(
    snapshot: MonitorSnapshot,
    previous: list[MonitorSnapshot] | None = None,
) -> list[Finding]:
    previous = previous or []
    findings: list[Finding] = []

    for role in GATE_ROLES:
        member = _gate_member(snapshot, role)
        if member is None:
            findings.append(
                Finding(
                    code=f"missing_{role}",
                    severity=Severity.P1,
                    summary=f"{role} missing from normalized snapshot",
                    owner=role,
                )
            )
            continue

        if member.lifecycle_state.lower() == "idle":
            findings.append(
                Finding(
                    code=f"{role}_idle_before_shutdown",
                    severity=Severity.P0,
                    summary=f"{role} entered idle before shutdown",
                    reason="Gate roles must stay in inbox loop until explicit shutdown.",
                    owner=role,
                )
            )

        if member.task_status.lower() == "completed":
            findings.append(
                Finding(
                    code=f"{role}_completed_before_shutdown",
                    severity=Severity.P0,
                    summary=f"{role} marked task completed before shutdown",
                    reason="Gate roles may not complete early.",
                    owner=role,
                )
            )

    if previous:
        last = previous[-1]
        for role in GATE_ROLES:
            curr = snapshot.members.get(role)
            prev = last.members.get(role)
            if not curr or not prev:
                continue
            unread_growth = curr.inbox_unread - prev.inbox_unread
            if unread_growth > 0 and not curr.has_new_activity:
                findings.append(
                    Finding(
                        code=f"{role}_unread_growth",
                        severity=Severity.P1,
                        summary=f"{role} inbox unread count is growing without activity",
                        reason="Possible inbox consumer stall.",
                        owner=role,
                        evidence=[f"prev={prev.inbox_unread}", f"curr={curr.inbox_unread}"],
                    )
                )

    if snapshot.phase in {"monitor", "success_hold"} and not snapshot.protocol_flags.get(
        "kickoffs_sent",
        False,
    ):
        findings.append(
            Finding(
                code="kickoffs_not_confirmed",
                severity=Severity.P1,
                summary="Role-specific kickoffs are not confirmed in the normalized snapshot",
                owner="supervisor",
            )
        )

    snapshot.findings = findings
    return findings


def success_flags(snapshot: MonitorSnapshot) -> dict[str, bool]:
    l1 = all(
        member.lifecycle_state.lower() != "idle"
        and member.task_status.lower() != "completed"
        for role, member in snapshot.members.items()
        if role in GATE_ROLES
    )
    l2 = all(
        snapshot.protocol_flags.get(key, False)
        for key in (
            "kickoffs_sent",
            "worker_revision_submitted",
            "gate_revision_matched",
            "supervisor_summary_published",
        )
    )
    l3 = snapshot.protocol_flags.get("success_hold_clean", False)
    return {"L1": l1, "L2": l2, "L3": l3}


def is_p0_failure(findings: list[Finding]) -> bool:
    return any(item.severity is Severity.P0 for item in findings)
