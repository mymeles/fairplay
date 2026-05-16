# API Style Guide

## Base Path

```text
/api/v1
```

## Resource Naming

Use plural nouns:

```http
POST /api/v1/sessions
GET /api/v1/sessions/:sessionId
POST /api/v1/sessions/:sessionId/join
GET /api/v1/sessions/:sessionId/queue
```

## Response Shape

### Success

```json
{
  "data": {},
  "meta": {
    "requestId": "req_abc"
  }
}
```

### List

```json
{
  "data": [],
  "meta": {
    "requestId": "req_abc",
    "count": 10,
    "cursor": "next_cursor"
  }
}
```

### Error

```json
{
  "error": {
    "code": "INVALID_JOIN_CODE",
    "message": "The join code is invalid.",
    "requestId": "req_abc",
    "details": {}
  }
}
```

## Status Codes

```text
200 OK              Read/update successful
201 Created         Resource created
202 Accepted        Async/runner operation accepted
400 Bad Request     Invalid input
401 Unauthorized    Missing/invalid auth
403 Forbidden       Authenticated but not allowed
404 Not Found       Missing resource
409 Conflict        Duplicate/conflicting state
410 Gone            Session expired/ended
429 Too Many Requests Rate-limited
500 Server Error    Unexpected error
502 External Error  Spotify/external dependency failed
```

## Idempotency

Required for:

- Queue dispatch to Spotify.
- Token spend.
- Host veto.
- Session end.
- Future webhook-like integrations.

Use an `idempotencyKey` where duplicate requests are likely.

## Pagination

Use cursor-based pagination for queue history and audit logs.

```http
GET /api/v1/sessions/:sessionId/audit?cursor=abc&limit=50
```

## Authorization Model

Tokens:

- Host JWT: can manage owned sessions.
- Guest JWT: can act inside one session only.
- Admin JWT: future internal use only.

Every endpoint must declare one of:

```text
Public
Host only
Guest only
Host or guest
Internal worker only
```
