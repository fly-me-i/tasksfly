// asyncHandler.js
// A tiny wrapper for async route handlers.
//
// Express 4 (what this app uses) does NOT automatically catch errors thrown
// inside an `async` route handler. With better-sqlite3 this never came up,
// because every database call was synchronous — a thrown error propagated
// immediately and Express's default handling caught it. Now that every
// database call is an `await`ed Postgres query, an error inside one is a
// *rejected promise*, and an uncaught rejected promise inside a route
// handler just leaves the request hanging forever — the client never gets
// a response, and it never times out on its own.
//
// Wrapping a handler in asyncHandler(...) fixes that: it catches any
// rejection and forwards it to Express's error-handling middleware (defined
// at the bottom of server.js) via next(err).
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
