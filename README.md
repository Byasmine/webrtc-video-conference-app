# Video Conferencing Application

A WebRTC-based video conferencing platform similar to Google Meet, with authentication via Clerk and data persistence in PostgreSQL.

## Features

- **Authentication**: Clerk-based sign-in/sign-up
- **Rooms**: Create and join video call rooms
- **Real-time Video/Audio**: Peer-to-peer WebRTC with signaling via Socket.IO
- **Recording**: Client-side recording with MediaRecorder API, upload to backend, metadata persistence
- **Grid Layout**: Responsive participant grid

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Clerk, Socket.IO client
- **Backend**: Node.js, Express, Socket.IO, Clerk, PostgreSQL
- **Infrastructure**: Docker Compose

## Prerequisites

1. [Clerk](https://clerk.com) account - create an application and get:
   - `CLERK_SECRET_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY` (starts with `pk_`)

2. Docker and Docker Compose

## Quick Start

1. Create a `.env` file in the project root:

```env
CLERK_SECRET_KEY=sk_test_xxxx
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxx
```

2. Run with Docker Compose:

```bash
docker compose up --build
```

3. Open http://localhost in your browser.

4. Sign in with Clerk (you'll be redirected to Clerk's hosted sign-in).

5. Create a room, then open another browser/incognito window to join as a second participant.

## Local Development

### Backend

```bash
cd backend
cp ../.env .  # or set env vars
npm install
npm run dev
```

Requires PostgreSQL running (e.g. via Docker: `docker compose up postgres -d`).

### Frontend

```bash
cd frontend
npm install
# Create .env with VITE_API_URL=http://localhost:5000, VITE_WS_URL=http://localhost:5000, VITE_CLERK_PUBLISHABLE_KEY=pk_xxx
npm run dev
```

### Clerk Configuration

In your Clerk dashboard:

1. Add `http://localhost:5173` and `http://localhost` to allowed origins for development/production.
2. Configure sign-in/sign-up methods as desired.
