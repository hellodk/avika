# Multi-Agent Coordination Strategy

This guide outlines a strategy for effectively using multiple AI agents to work on the Avika NGINX Manager codebase without conflicts.

## 1. Branch-Based Isolation (Recommended)

Assign each agent a dedicated **Feature Branch** carved out from a shared base (usually `master` or `main`).

- **Naming Convention**: `agent/<agent-name>-<feature-area>` (e.g., `agent/avika-ui-cleanup`).
- **Scope**: Keep branch scopes narrow to minimize the footprint of changes.

## 2. Horizontal vs. Vertical Decomposition

- **Horizontal (By Layer)**: 
  - Agent 1: Frontend (React/Next.js).
  - Agent 2: Backend (Go/Gateway/API).
  - Agent 3: Infrastructure (Helm/K8s/Terraform).
- **Vertical (By Feature)**:
  - Agent 1: Full-stack "Alerting" feature.
  - Agent 2: Full-stack "Inventory" feature.

*Vertical decomposition is better for independent features; Horizontal is better for large refactorings.*

## 3. Communication & State Management

Agents should use **Artifacts** to communicate state:
- **`ROADMAP.md`**: The source of truth for pending tasks.
- **`walkthrough.md`**: The proof of work for recently completed tasks.
- **`IMPLEMENTED_VS_PENDING.md`**: High-level project status.

## 4. Conflict Resolution Protocol

1. **Rebase Early**: Agents should rebase their feature branches onto `master` frequently.
2. **Review Policy**: User acts as the "Principal Architect," reviewing implementation plans and walkthroughs before merging.
3. **Atomic Commits**: Encourage small, atomic commits with descriptive messages to simplify merge conflict resolution.

## 5. Coordination Workflow Example

1. **Agent A** creates `implementation_plan.md` for UI changes.
2. **User** approves.
3. **Agent A** implements in `agent/ui-feature`.
4. **Agent B** reads Agent A's `implementation_plan.md` and notices a dependency on a backend API.
5. **Agent B** creates a backend branch `agent/api-support` and adds the requested endpoint.
6. **Agent A** consumes the new endpoint.

---
*Created: 2026-03-05*
