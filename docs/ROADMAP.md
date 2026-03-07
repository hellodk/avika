# Avika Roadmap & Technical Debt

This document centralizes the planned improvements and technical debt items for the Avika NGINX Manager.

## 🚀 Future Features & Roadmap

### 1. Agent Labeling & Multi-Tenancy (High Priority)
- **Advanced Labeling**: Implement richer metadata for agents to support complex routing and isolation.
- **Project/Environment Isolation**: Enhance RBAC to strictly enforce boundaries between logical projects.

### 2. Agent Update Architecture (P1)
- **Rolling Updates**: Implement strategies for non-disruptive agent fleet updates.
- **Version Pinning**: Allow environments to stay on specific agent versions for stability.

### 3. Web Terminal Enhancements (UX)
- **Session Persistence**: Allow terminal sessions to survive tab reloads.
- **Multi-Instance Concatenation**: View logs/exec from multiple instances in a single unified view.

### 4. Geo-Analytics Improvements
- **Map Interactivity**: Add drill-downs for specific regions/cities.
- **Provider Accuracy**: Switch to more granular GeoIP providers (e.g., MaxMind).

### 5. Grafana Integration
- **Deep Linking**: Direct drill-down from Avika dash into corresponding Grafana panels.
- **Native Embedding**: Use Grafana scenes or iframe embedding for a more unified UI.

## 🛠️ Technical Debt & Polish

- **Backend Data quality**: Completed - pg/ch versions and metadata added.
- **UI Simplification**: Completed - Sidebar consolidated and Security hub added.
- **Refactoring**: Consolidate repetitive gRPC boilerplate into shared internal utilities.
- **Tests**: Expand E2E coverage for the new Security settings hub.

---
*Last Updated: 2026-03-05*
