using Asp.Versioning;

namespace Multideck.Server.Configuration;

/// <summary>
/// Source of truth for the API versions this app exposes. Add a new constant here when a
/// module needs to introduce a new version, and reference it from that module's route group.
/// </summary>
public static class ApiVersions
{
    public static readonly ApiVersion V1 = new(1);
}
