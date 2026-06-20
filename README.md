# SortMyScene — Event Ticket Booking System

A seat reservation + booking app for events, built MERN-style for a take-home assignment. Pick an event, grab some seats, you get a 10-minute hold to confirm before they go back into the pool.

## Stack

- **Backend:** Node, Express, MongoDB/Mongoose, JWT auth, bcrypt for passwords
- **Frontend:** React 18 + Vite, React Router v6, Axios

## Running it locally

You'll need Node 18+ and a MongoDB instance (local `mongod` or an Atlas connection string both work).

### Backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and fill it in:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sortmyscene
JWT_SECRET=your_super_secret_jwt_key_change_in_production
```

That `JWT_SECRET` value is just a placeholder so the app boots without extra setup — swap it for something random (`openssl rand -hex 32` works fine) before this ever runs anywhere other than your laptop. Whoever holds that secret can mint a valid login token for any user, so don't leave the placeholder in.

Then seed some sample events/seats and start the server:

```bash
npm run seed     # creates 4 events with seats
npm run dev      # nodemon, for actually working on it
npm start        # plain node, closer to prod
```

Backend listens on `http://localhost:5000`.

Tests (this includes the concurrency/double-booking stuff, more on that below):

```bash
npm test
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

## API

### Auth

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | returns a JWT |
| POST | `/api/auth/login` | `{ email, password }` | returns a JWT |

Everything else needs `Authorization: Bearer <token>`.

### Events

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/events` | list everything |
| GET | `/api/events/:id` | event + all its seats |

`GET /api/events/:id` gives you back something like:

```json
{
  "event": { "_id": "...", "name": "...", "dateTime": "...", "venue": "...", "totalSeats": 36 },
  "seats": [
    { "_id": "...", "eventId": "...", "seatNumber": 1, "status": "available" }
  ]
}
```

### Reserve

| Method | Endpoint | Body/Query | Notes |
|---|---|---|---|
| GET | `/api/reserve?eventId=...` | — | your active reservation for that event, or `{ reservation: null }`. Lets the frontend restore the countdown on a page refresh |
| POST | `/api/reserve` | `{ eventId, seatNumbers: [1,2,3] }` | holds the seats for 10 minutes |

Success looks like:

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

If a seat's already gone you get a 409:

```json
{ "error": "Seat(s) 1, 2 are no longer available. Please refresh and try again." }
```

### Bookings

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/api/bookings` | `{ reservationId }` | locks in the booking, seats become `booked` |

```json
{
  "success": true,
  "message": "Booking confirmed! Your seats are secured.",
  "bookedSeats": [1, 2],
  "eventId": "..."
}
```

Booking against an expired reservation gives a 410:

```json
{ "error": "Your reservation has expired. Please select seats and reserve again." }
```

## Data model

**User** — name, email (unique), password (bcrypt hashed)

**Event** — name, dateTime, venue, totalSeats

**Seat** — eventId, seatNumber, status (`available` / `reserved` / `booked`). Compound unique index on `(eventId, seatNumber)`.

**Reservation** — userId, eventId, seatNumbers[], expiresAt (`now + 10 min`)

## Assumptions I made

- Spec said "basic auth," so that's register/login with JWT — no OAuth, no email verification.
- Seats get created by the seed script alongside each event, one document per seat.
- One active reservation per user per event at a time. You either finish it or let it expire before starting another.
- A reserve request is all-or-nothing — if any seat in the batch is taken, nothing in that request gets reserved.
- Didn't use Mongo transactions. They need a replica set, which felt like overkill for a take-home. Instead I lean on atomic single-document `findOneAndUpdate` calls (one per seat) plus an explicit rollback if part of a multi-seat request fails partway through — same end guarantee, works against a plain standalone `mongod`.
- Every controller checks that `eventId`/`reservationId` are actually valid Mongo ObjectIds and `seatNumbers` are positive integers before any of it touches a query. Otherwise something like `{ "eventId": { "$ne": null } }` would sail straight into a Mongoose filter as a query operator instead of a value — that's the NoSQL injection angle.

## How the seat reservation actually works

1. Frontend hits `POST /api/reserve` with `eventId` + the seats the user picked.
2. Backend checks the eventId is real, seatNumbers are sane, and the user doesn't already have a live reservation on this event.
3. For each seat, one at a time: `Seat.findOneAndUpdate({ eventId, seatNumber, status: 'available' }, { $set: { status: 'reserved' } })`. Each of those calls is atomic on its own.
4. If every seat in the request got claimed, a `Reservation` gets created with `expiresAt` ten minutes out.
5. If even one seat in the batch fails, whatever got claimed earlier in that same loop gets rolled back to `available`, and the whole thing returns a 409. No half-reserved leftovers.
6. Frontend starts a countdown from the response. Refresh the page and `GET /api/reserve?eventId=...` pulls the still-active reservation back so the timer doesn't just vanish.

## Expiry

Two things handle this, working together:

- At booking time, the backend checks `reservation.expiresAt < now` directly and bails with a 410 if it's stale.
- A background job runs every 30 seconds, finds reservations past their `expiresAt`, puts their seats back to `available`, and deletes the reservation. Without this the seat grid would keep showing seats as "reserved" forever even after the hold lapsed for everyone else looking at it.

## Double booking — the part that actually matters

The whole thing hinges on Mongo's document-level atomicity:

```js
Seat.findOneAndUpdate(
  { eventId, seatNumber, status: 'available' },
  { $set: { status: 'reserved' } }
)
```

Two requests landing on the same seat at the same instant don't race each other the way you'd expect in app code — Mongo serializes writes to a single document, so there's no gap between "read the status" and "write the status" for anyone else to slip into. First one in finds `available`, updates it, gets the doc back. Second one finds the seat already `reserved`, the filter doesn't match anything, `findOneAndUpdate` hands back `null`, and nothing changes. Backend treats that `null` as "this seat's gone," rolls back anything else it grabbed in the same request, and 409s.

I didn't just trust the theory here — ran it with 10, 25, and 50 simultaneous reservation requests hitting the same seat from different fake users, and every single time exactly one got through and the rest got 409'd, with the DB ending up in one consistent state. That test is part of the regular suite (`npm test`), not something you have to remember to run separately. The compound unique index on `(eventId, seatNumber)` is the backup in case anything ever tried to insert a duplicate seat doc directly.

## Why I built it this way

- Routes stay thin, controllers hold the logic — easier to unit test the actual booking behavior without dragging Express into it.
- Atomic per-seat writes instead of a transaction, because the spec allows either and a replica set is a lot of setup for a project this size. Sequential atomic updates with rollback-on-failure get you the same exactly-once guarantee without it.
- JWT sits in localStorage. Fine for this scope — in a real production app I'd move to HttpOnly cookies to cut down XSS exposure.
- Vite's dev proxy forwards `/api` calls to the backend, so there's no CORS fuss locally and it roughly mirrors how a reverse proxy would sit in front of this in prod.
- Skipped a TTL index for cleanup — it would delete the reservation doc on schedule but wouldn't touch the seat status, leaving seats stuck as "reserved" forever. The background job resets both, so I went with that instead.
- Input validation against injection-shaped payloads happens before anything reaches Mongoose, for the same reason described above in Assumptions.

## Testing

```bash
cd backend
npm test
```

Runs against a separate `sortmyscene_test` database, so it's never going to touch whatever's in your dev DB.

| File | What it covers |
|---|---|
| `auth.test.js` | register/login, both happy path and injection-shaped junk getting rejected |
| `events.test.js` | list/detail, auth requirement, bad/missing ids |
| `reservation.test.js` | reserve happy path, seat already gone, partial-failure rollback, duplicate active reservation, bad input, lookup of an active reservation |
| `booking.test.js` | booking success, expired (410), wrong owner (403), missing (404), bad input, and a regression test for a cleanup-job race that used to let a booking falsely report success |
| `concurrency.test.js` | the one that matters — 10/25/50 truly simultaneous reserve requests for the same seat, checks exactly one wins, plus a reserve→book race between two concurrent "winners" |
| `rateLimit.test.js` | actually hits the login rate limiter enough times to get a 429, instead of just checking it's wired up |

The concurrency suite isn't a side script you have to remember to run — it's in the normal `npm test` run, so a regression there fails the build instead of just looking wrong in the browser if you happen to notice.

## Security notes

- Login is rate-limited to 10 attempts / 15 min per IP. Register is 20 / 15 min — looser on purpose, since spam signups are a smaller problem than someone brute-forcing a specific account. Both just return 429 once you hit the limit. The only place this is turned off is inside the test suite (`DISABLE_RATE_LIMIT=true`), never in a normal dev/prod boot.
- `helmet` is on globally for the usual headers — CSP, X-Content-Type-Options, X-Frame-Options, HSTS, etc.
- Same NoSQL injection guard mentioned above: ObjectIds and seat numbers get validated before touching a query, and email/password/name have to actually be strings. Otherwise `{"email": {"$ne": null}}` as a body would happily match the first user in the collection.
- Errors never leak internals back to the client — Mongoose `CastError`/`ValidationError` become a generic 400, everything else becomes a generic 500. Real error details and stack traces only go to the server logs.
