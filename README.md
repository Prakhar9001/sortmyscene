# SortMyScene — Event Ticket Booking System

A full-stack event seat reservation and booking application built with the MERN stack.

---

## Tech Stack

**Backend:** Node.js, Express.js, MongoDB, Mongoose, JWT (jsonwebtoken), bcryptjs  
**Frontend:** React 18, React Router v6, Axios, Vite

---

## Setup Instructions

### Prerequisites
- Node.js v18+
- MongoDB running locally (or a MongoDB Atlas URI)

---

### Backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory (copy `.env.example` as a starting point):

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sortmyscene
JWT_SECRET=your_super_secret_jwt_key_change_in_production
```

> **Security note on `JWT_SECRET`:** the value above is a placeholder, not a real secret — it exists only so the app boots out of the box for local development. `.env` is git-ignored and must never be committed. Before deploying anywhere outside your own machine, replace `JWT_SECRET` with a long, random value (e.g. `openssl rand -hex 32`) — anyone who knows this value can forge a valid login token for any user.

Seed sample data (creates 4 events with seats):

```bash
npm run seed
```

Start the server:

```bash
npm run dev      # Development (with nodemon)
npm start        # Production
```

Server runs on **http://localhost:5000**

Run the automated test suite (Jest + Supertest, including the concurrency/double-booking tests — see "Testing" below):

```bash
npm test
```

---

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**

---

## API Documentation

### Authentication

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | `{ name, email, password }` | Register new user, returns JWT |
| POST | `/api/auth/login` | `{ email, password }` | Login, returns JWT |

All event/reserve/booking endpoints require: `Authorization: Bearer <token>`

---

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List all events |
| GET | `/api/events/:id` | Event details + all seat statuses |

**GET /api/events/:id response:**
```json
{
  "event": { "_id": "...", "name": "...", "dateTime": "...", "venue": "...", "totalSeats": 36 },
  "seats": [
    { "_id": "...", "eventId": "...", "seatNumber": 1, "status": "available" },
    ...
  ]
}
```

---

### Reserve

| Method | Endpoint | Body / Query | Description |
|--------|----------|------|-------------|
| GET | `/api/reserve?eventId=...` | — | Get the caller's active (non-expired) reservation for an event, or `{ "reservation": null }` if none. Used to restore the countdown timer/seat selection on page reload. |
| POST | `/api/reserve` | `{ eventId, seatNumbers: [1,2,3] }` | Reserve seats for 10 minutes |

**Success (201):**
```json
{
  "reservation": {
    "_id": "...",
    "userId": "...",
    "eventId": "...",
    "seatNumbers": [1, 2],
    "expiresAt": "2025-06-19T10:10:00.000Z"
  }
}
```

**Error (409) — seat unavailable:**
```json
{ "error": "Seat(s) 1, 2 are no longer available. Please refresh and try again." }
```

---

### Bookings

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/bookings` | `{ reservationId }` | Confirm booking, marks seats as booked |

**Success (200):**
```json
{
  "success": true,
  "message": "Booking confirmed! Your seats are secured.",
  "bookedSeats": [1, 2],
  "eventId": "..."
}
```

**Error (410) — expired:**
```json
{ "error": "Your reservation has expired. Please select seats and reserve again." }
```

---

## Database Schema

### User
| Field | Type | Notes |
|-------|------|-------|
| name | String | Required |
| email | String | Unique, lowercase |
| password | String | bcrypt hashed, min 6 chars |

### Event
| Field | Type | Notes |
|-------|------|-------|
| name | String | Required |
| dateTime | Date | Required |
| venue | String | Required |
| totalSeats | Number | Required, min 1 |

### Seat
| Field | Type | Notes |
|-------|------|-------|
| eventId | ObjectId | Ref: Event |
| seatNumber | Number | Unique per event |
| status | String | `available` \| `reserved` \| `booked` |

Compound unique index on `(eventId, seatNumber)`.

### Reservation
| Field | Type | Notes |
|-------|------|-------|
| userId | ObjectId | Ref: User |
| eventId | ObjectId | Ref: Event |
| seatNumbers | [Number] | Array of reserved seat numbers |
| expiresAt | Date | `now + 10 minutes` |

---

## Assumptions

1. **Authentication scope:** Basic JWT auth is implemented (register + login). No OAuth or email verification — the spec calls for "basic" auth.
2. **Seat creation:** Seats are pre-created via the seed script when an event is added. Each event has exactly `totalSeats` seat documents.
3. **One reservation per user per event:** A user can only hold one active reservation per event at a time. They must complete or wait for expiry before reserving again.
4. **No partial booking:** All seats in a reserve request must be available. If even one is taken, the entire request fails and nothing is reserved.
5. **No replica set required:** `reservationController.js` and `bookingController.js` use single-document atomic `findOneAndUpdate`/`updateMany` calls instead of multi-document Mongoose transactions, so the app runs against a standalone `mongod` with no replica set needed. The compound unique index on `Seat` plus the `status: 'available'` guard on every update still guarantee exactly-once seat reservation (see Design Decisions below). If a multi-seat reserve request partially succeeds and then hits an unavailable seat, the already-claimed seats in that request are explicitly rolled back to `available` before returning the 409 — no orphaned reservations are left behind.
6. **Input validation against NoSQL injection:** Every controller validates that user-supplied `eventId`/`reservationId` are well-formed Mongo ObjectId strings and that `seatNumbers` are positive integers (`utils/validate.js`) before they reach a query. Without this, a payload like `{ "eventId": { "$ne": null } }` would be passed straight into a Mongoose filter, since Express/Mongoose don't reject query-operator objects in place of expected scalars by default.

---

## Design Decisions

### How Seat Reservation Works

When a user clicks Reserve:
1. The frontend sends `POST /api/reserve` with `{ eventId, seatNumbers }`.
2. The backend validates `eventId` is a real ObjectId and `seatNumbers` is a non-empty array of positive integers, and checks the user doesn't already hold an active reservation for this event.
3. For each seat number, in sequence, it runs `Seat.findOneAndUpdate({ eventId, seatNumber, status: 'available' }, { $set: { status: 'reserved' } })`. Each call is atomic at the document level.
4. If every seat is claimed successfully, a `Reservation` document is created with `expiresAt = now + 10 minutes`.
5. If any seat in the batch is unavailable, the seats already claimed earlier in that same loop are rolled back to `available` via `Seat.updateMany`, and the request fails with 409 — so a partial reservation is never left behind, even without a DB transaction.
6. The frontend receives the reservation and starts a countdown timer. On page reload, `GET /api/reserve?eventId=...` restores that timer from the still-active `Reservation` document if one exists.

### How Reservation Expiry Works

Two mechanisms work in tandem:

- **On booking confirmation:** The backend explicitly checks `reservation.expiresAt < now` before proceeding. Expired reservations are rejected with HTTP 410.
- **Background cleanup job:** Runs every 30 seconds on the server. Finds all `Reservation` documents where `expiresAt < now`, resets their seats back to `available`, and deletes the reservation documents. This ensures the seat grid reflects true availability for other users.

### How Double Booking Prevention Works

This is the critical constraint. The solution uses **MongoDB's document-level atomic writes**:

```js
Seat.findOneAndUpdate(
  { eventId, seatNumber, status: 'available' },  // condition
  { $set: { status: 'reserved' } }                // update
)
```

If two requests arrive simultaneously for the same seat:
- MongoDB serializes writes to the same document — there is no race window between the read of `status` and the write, because the condition and the update happen as a single atomic operation on the storage engine.
- The first request finds `status: 'available'` → succeeds → returns the updated document.
- The second request now finds `status: 'reserved'` → **condition fails** → `findOneAndUpdate` returns `null` (no matching document), and nothing is modified.
- The backend detects `null`, adds that seat number to the failure list, rolls back any seats it had already claimed in the same request, and returns a 409 error.

This guarantees exactly-once reservation semantics per seat without application-level locking and without needing a multi-document transaction, since each individual seat claim is a single atomic write. It was load-tested with 10, 25, and 50 concurrent reservation requests for the same seat from different users — in every run, exactly one request succeeded and the rest received 409s, with zero exceptions or inconsistent seat states. The compound unique index on `(eventId, seatNumber)` is a second line of defense against duplicate seat documents.

### Why This Architecture

- **Controller/Route separation:** Keeps route definitions clean and business logic testable in isolation.
- **Atomic per-document writes over transactions:** The spec allows "atomic operations or transactions." Multi-document Mongoose transactions require a replica set, which adds operational overhead for a take-home-sized project. Sequential atomic `findOneAndUpdate` calls with explicit rollback-on-partial-failure give the same exactly-once guarantee per seat with a standalone `mongod`.
- **JWT in localStorage:** Simple and stateless. For production, HttpOnly cookies would be preferable to prevent XSS.
- **Vite proxy:** The frontend proxies `/api` requests to the backend, avoiding CORS issues in development and mimicking a real production reverse proxy setup.
- **Background cleanup vs. TTL index:** A MongoDB TTL index would delete the `Reservation` document automatically, but would **not** reset the seat status. The background job handles both, ensuring seats are returned to the pool on expiry.
- **Input validation against injection:** All ObjectId and numeric inputs are validated before reaching a Mongoose query (see Assumption 6) to prevent NoSQL query-operator injection via the JSON body or query string.

---

## Testing

```bash
cd backend
npm test
```

Runs the full Jest + Supertest suite (`backend/tests/`) against a dedicated `sortmyscene_test` database — it never touches your dev data. Coverage:

| File | Covers |
|---|---|
| `auth.test.js` | register/login success and failure, NoSQL-injection-shaped payloads rejected |
| `events.test.js` | list/detail endpoints, auth requirement, invalid/missing event ids |
| `reservation.test.js` | reserve success, seat already reserved/booked, partial-failure rollback, duplicate active reservation, invalid input rejection, active-reservation lookup |
| `booking.test.js` | booking success, expired reservation (410), wrong owner (403), missing reservation (404), invalid input, **the cleanup-job race condition that previously let a booking report false success** |
| `concurrency.test.js` | **the critical test** — fires 10, 25, and 50 truly simultaneous `POST /api/reserve` requests for the same seat from different users and asserts exactly one succeeds, the rest get 409s, and the database ends up in a single consistent state. Also verifies a full reserve→book race between two concurrent winners-take-one-seat. |
| `rateLimit.test.js` | confirms the login rate limiter actually returns 429 after its threshold, not just that it's wired up |

The concurrency suite runs on every `npm test` — it's not a manual/optional script — so a regression in the double-booking guarantee fails CI, not just a human glancing at seat colors in the browser.

---

## Security Notes

- **Rate limiting:** `/api/auth/login` is capped at 10 attempts / 15 minutes per IP (credential-stuffing protection); `/api/auth/register` is capped at 20 / 15 minutes (registration-spam protection — deliberately more generous, since spam signups are a lower-severity threat than brute-forcing a specific account). Both return `429` with a clear message once exceeded. Disabled only inside the automated test suite via `DISABLE_RATE_LIMIT=true`, which is never set in a normal dev/prod boot.
- **`helmet`** is applied globally for standard secure headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS, etc.).
- **NoSQL injection:** every controller validates `eventId`/`reservationId` as well-formed ObjectIds and `seatNumbers` as positive integers before they reach a Mongoose query, and `email`/`password`/`name` are checked to be actual strings. Without this, a payload like `{"email": {"$ne": null}}` would be passed straight into a Mongoose filter and match an arbitrary user.
- **Error responses never leak internals:** the global error handler maps Mongoose `CastError`/`ValidationError` to a generic `400`, and everything else to a generic `500` — raw error messages and stack traces are logged server-side only, never sent to the client.
