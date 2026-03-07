# System Health Page — Layout (from design mockups)

Layout decisions derived from the provided design mockups. Colors are flexible; this doc focuses on structure.

## Recommended layout (vertical order)

1. **Page header**
   - Title: "System Overview"
   - Subtitle: "Infrastructure health and agent fleet status"
   - Right: status pill "X/Y Agents Online" + Refresh button

2. **System Overview (one card, 4 metrics in a row)**
   - Total Agents (count)
   - Active Agents (count, optional: "+ N last hour")
   - Fleet Uptime (%)
   - System Version (e.g. v1.13.0)

3. **Infrastructure Health (one card)**
   - Title: "Infrastructure Health"
   - Subtitle: "Core system services and their current status"
   - Legend: Healthy (green) | Warning (yellow) | Down (red)
   - Grid of service cards (e.g. 4–5): API Gateway, PostgreSQL, ClickHouse, Agent Network
   - Each card: icon, name, status badge, primary metric (latency/throughput/storage), version

4. **Lower area — two columns**
   - **Left column**
     - **Service Uptime (Past 24 Hours)**: title + time-range dropdown; horizontal segmented bar(s) per service (green/yellow/red). Backend: time-series of health checks or synthetic until available.
     - **Agent Fleet**: title + "View Inventory" link; **grid of status squares** (one per agent: green = online, gray = offline); "X of Y agents online"; short description; View Inventory CTA.
   - **Right column**
     - **Recent Events**: title + "View Inventory" link; chronological list (time, severity icon, message, "X ago"). Backend: event feed or derived from agent connect/disconnect/heartbeats.

## What we have today (vs mockup)

| Section              | Current /system              | Mockup layout                         |
|----------------------|-----------------------------|----------------------------------------|
| Header               | Yes (title, badge, refresh)  | Same                                  |
| System Overview      | Yes (4 cards)               | Same                                  |
| Infrastructure       | Yes, "Infrastructure Components" | Rename to "Infrastructure Health", add legend |
| Service Uptime       | No                          | Add (placeholder or simple bars)       |
| Agent Fleet          | Single CTA card             | Add **status grid** (dots/squares)     |
| Recent Events        | No                          | Add (placeholder or derived events)   |

## Implementation notes

- **Agent grid**: Render one small square per agent (e.g. from `agents`), green if online, gray if offline; link grid or "View Inventory" to `/inventory`.
- **Service Uptime bars**: Optional until gateway/DB expose health time-series; can show static 100% or "—" with tooltip "Uptime history coming soon."
- **Recent Events**: Optional until events API exists; can derive "Agent X last seen Y ago" from agents list or show "No recent events."
