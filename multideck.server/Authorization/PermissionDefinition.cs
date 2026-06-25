namespace Multideck.Server.Authorization;

public sealed record PermissionDefinition(
    string Value,
    string Group,
    string Name,
    string Description,
    bool IsDangerous = false);
