# Avika Executive Presentation (impress.js)

A browser-based presentation built with [impress.js](https://impress.js.org/) for senior management. Content is derived from the executive presentation, architecture, features, and roadmap docs.

## How to view

1. **Open in browser**  
   Open `index.html` directly in Chrome, Firefox, or Edge:
   ```bash
   # From repo root
   xdg-open docs/presentation/index.html
   # or
   firefox docs/presentation/index.html
   ```

2. **Or serve locally** (avoids some CORS with external images/fonts if needed):
   ```bash
   cd docs/presentation && python3 -m http.server 8080
   # Then open http://localhost:8080
   ```

## Controls

- **Next slide**: Right arrow, Space, or click
- **Previous slide**: Left arrow
- **Overview**: `Esc`
- **Go to slide**: Click on a slide in overview

## Contents

1. Title — Avika NGINX Manager  
2. Executive Summary  
3. Business Benefits (cost, efficiency, risk)  
4. Architecture Overview  
5. Technology Stack  
6. Salient Features  
7. Security Features  
8. Scalability  
9. Performance Impact  
10. Competitive Comparison  
11. Push vs Pull (agent model)  
12. Deployment Options  
13. Roadmap  
14. Implementation Timeline  
15. Summary — Why Avika  

Images use Unsplash (server/network themes). Fonts load from Google Fonts (Outfit, JetBrains Mono).
