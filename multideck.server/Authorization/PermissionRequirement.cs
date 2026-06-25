using Microsoft.AspNetCore.Authorization;

namespace Multideck.Server.Authorization;

public sealed class PermissionRequirement(string permissionValue) : IAuthorizationRequirement
{
    public string PermissionValue { get; } = permissionValue;
}
