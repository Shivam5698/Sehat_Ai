# Sehat AI

**Intelligent AI-powered healthcare platform** providing a real -time multi-agent medical consultations, hospital matching, appointment booking, and medical report generation.

## Overview

Sehat AI is a production-grade healthcare AI platform that orchestrates multiple specialized AI agents to provide comprehensive medical consultation services. The system analyzes patient symptoms, assesses severity, detects safety risks, matches nearby hospitals, books appointments, and generates hospital-grade medical reports.

**Key Features:**
- Real-time AI video consultations with voice and text support
- Accurate symptom analysis and medical reasoning
- Dynamic severity scoring with emergency escalation
- Intelligent hospital matching and availability checking
- Autonomous appointment booking
- Hospital-grade medical report generation
- Multilingual support (English, Hindi, Urdu)
- Live agent activity monitoring and transparency dashboard

## Architecture

### Technology Stack

- **Frontend Framework:** TanStack Start with React 19 and TypeScript
- **Build Tool:** Vite 7 with Tailwind CSS v4
- **UI Components:** shadcn/ui with Radix UI primitives
- **Styling:** Tailwind CSS v4 with semantic color tokens
- **Animations:** Framer Motion
- **Charts & Visualization:** Recharts
- **State Management:** TanStack Query (React Query)
- **Routing:** TanStack Router with file-based routes
- **i18n:** Context-based multilingual support
- **Icons:** Lucide React
- **Deployment:** Cloudflare Workers (Wrangler)

### Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── Navbar.tsx      # Navigation header
│   ├── Footer.tsx      # Application footer
│   ├── AgentCard.tsx   # AI agent status card
│   ├── FloatingCard.tsx # Animated floating elements
│   └── ...
├── routes/             # TanStack Router file-based routes
│   ├── __root.tsx      # Root layout and providers
│   ├── index.tsx       # Home page
│   ├── ai-doctor.tsx   # Consultation interface
│   ├── consult.tsx     # Hospital/consultation matching
│   ├── reports.tsx     # Medical report view
│   ├── dashboard.tsx   # Live agent monitoring
│   └── ...
├── lib/                # Utility functions and helpers
│   ├── utils.ts        # Common utilities
│   ├── i18n.tsx        # Internationalization
│   ├── error-capture.ts # Error tracking
│   └── error-page.ts   # Error page renderer
├── hooks/              # Custom React hooks
├── assets/             # Images and static assets
├── styles.css          # Global styles with Tailwind
├── router.tsx          # Router configuration
├── start.ts            # TanStack Start initialization
└── server.ts           # Server entry point (Cloudflare)
```

## Run locally

### Prerequisites

- Node.js 20+ and npm
- Redis on port `6379` is optional for REST API use; real-time features may require it.

### Environment

Copy each checked-in `.env.example` to `.env` beside that example, then configure the values needed by that service. In `backend/.env`, set:

```dotenv
DATABASE_URL="file:./dev.db"
PORT=5000
JWT_SECRET=<a-long-random-secret>
JWT_REFRESH_SECRET=<a-different-long-random-secret>
```

Never commit `.env` files or secrets.

### Start services

Prepare the backend database first:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

Start the services in this order, each in its own terminal from the repository root:

1. **Symptom agent** (`http://localhost:5001`):
   ```bash
   npm --prefix "ai/agents/symptom-agent/symptom-agent" run dev
   ```
2. **Severity agent** (`http://localhost:5002`):
   ```bash
   npm --prefix "ai/agents/severity-agent/sevarity agent" run dev
   ```
3. **Safety agent** (`http://localhost:5003`):
   ```bash
   npm --prefix "ai/agents/safety-agent/safety agent" run dev
   ```
4. **Backend** (`http://localhost:5000`):
   ```bash
   cd backend
   npm run dev
   ```
5. **Frontend** (`http://localhost:5173`):
   ```bash
   npm --prefix frontend run dev
   ```

### Backend tests

```bash
npm --prefix backend test
```

### Smoke test

With the agents, backend, and frontend running, exercise the REST API:

1. **Sign up**:
   ```bash
   curl -X POST http://localhost:5000/api/auth/signup -H "Content-Type: application/json" -d "{\"email\":\"smoke@example.com\",\"password\":\"SmokeTest123!\",\"name\":\"Smoke Test\"}"
   ```
2. **Log in** with those credentials:
   ```bash
   curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"smoke@example.com\",\"password\":\"SmokeTest123!\"}"
   ```
   Copy `accessToken` from the response for the next requests.
3. **Start a consultation** (replace `<ACCESS_TOKEN>` with that token):
   ```bash
   curl -X POST http://localhost:5000/api/consultation/start -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" -d "{\"language\":\"en\"}"
   ```
   Copy `session.id` from the response.
4. **Send a message** (replace both placeholders):
   ```bash
   curl -X POST http://localhost:5000/api/ai-doctor/message -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" -d "{\"consultationId\":\"<CONSULTATION_ID>\",\"message\":\"I have a mild headache since yesterday\",\"language\":\"en\"}"
   ```

## Code Quality

### Linting

Run ESLint to check code quality:

```bash
bun run lint
```

### Code Formatting

Format code with Prettier:

```bash
bun run format
```

## Deployment

### Cloudflare Workers

Deploy to Cloudflare Workers:

```bash
bun run deploy
```

The application uses `wrangler.jsonc` for Cloudflare configuration.

## Multi-Agent Architecture

Sehat AI orchestrates multiple specialized AI agents:

1. **Symptom Agent** - Extracts and validates medical symptoms from natural language
2. **Severity Agent** - Calculates clinical severity scores and risk levels
3. **Safety Agent** - Monitors for red flags and determines escalation urgency
4. **Hospital Agent** - Matches patients with nearby qualified hospitals
5. **Appointment Agent** - Autonomously books consultation slots
6. **Report Agent** - Generates hospital-grade medical reports
7. **Orchestrator** - Coordinates multi-agent workflow and reasoning chains

All agents operate with confidence scoring and are monitored in real-time through the dashboard.

## API Integration

The frontend connects to backend services for:

- AI agent orchestration
- Hospital and appointment databases
- Medical report generation
- User authentication and session management
- Real-time WebSocket updates for live monitoring

Refer to the backend documentation for API specifications.

## Internationalization (i18n)

Multilingual support is implemented via React Context with support for:

- **English** (en)
- **Hindi** (hi)
- **Urdu** (ur)

Users can switch languages using the language selector in the navigation bar.

## Styling Guide

### Design System

The application uses a semantic design system with Tailwind CSS v4:

**Primary Colors:**
- Primary: `#12C7B5` (Teal)
- Secondary: `#0FAF9D`
- Light: `#EFFFFC`

**Semantic Colors:**
- Background: `#FFFFFF`
- Section: `#F8FFFD`
- Border: `#DDF5F1`
- Foreground: `#1E293B`
- Muted: `#64748B`

**Status Colors:**
- Success: `#10B981` (Green)
- Warning: `#F59E0B` (Amber)
- Danger: `#EF4444` (Red)

**Gradients:**
- Primary gradient: Teal to Mint
- Medical shadow: Soft teal shadow effect

### Component Patterns

- **Buttons:** Rounded-full with gradient variants
- **Cards:** 24px border radius with soft shadows
- **Typography:** Poppins for headings, Inter for body
- **Spacing:** Consistent padding and margins aligned to 4px grid

## Performance Optimization

- Lazy loading for route components
- Image optimization and responsive sizing
- CSS-in-JS compiled at build time
- Efficient state management with React Query
- Code splitting by routes

## Accessibility

- Semantic HTML elements
- ARIA labels for interactive components
- Keyboard navigation support
- Color contrast compliance (WCAG AA)
- Screen reader optimization

## Security

- Input validation on forms
- XSS protection through React
- Secure headers configuration
- Environment variable isolation
- Cloudflare DDoS protection

## Monitoring & Logging

Error handling and monitoring:

- Global error boundary with recovery options
- Console error logging
- Error tracking with custom error pages
- Real-time activity feed for agent monitoring

## Contributing

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Run linting and formatting: `bun run lint` and `bun run format`
4. Submit a pull request with description

## License

Proprietary. All rights reserved.

## Support

For issues, feature requests, or questions:
- Create an issue in the repository
- Contact: support@sehatai.com

---

**Built by Sehat AI Team**  
Bringing intelligent healthcare to everyone
