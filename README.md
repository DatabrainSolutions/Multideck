# Multideck

A freight forwarding system with a .NET server and web client.

## Project Structure

```
multideck.client/   → Web client (index.html — just a placeholder for now)
multideck.server/   → .NET 10 Web API backend
```

## Running the Server

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)

### Run

```bash
cd multideck.server
dotnet run
```

The server starts at **`http://localhost:5273`** by default.

### Verify it's working

Open your browser and go to:

| URL | Description |
|---|---|
| `http://localhost:5273/` | Health check — should return "Multideck Server is running." |
| `http://localhost:5273/scalar/v1` | Scalar API documentation (interactive) |
| `http://localhost:5273/openapi/v1.json` | Raw OpenAPI spec |

> ⚠️ Scalar and OpenAPI are only available in **Development** mode (the default when running with `dotnet run`).
