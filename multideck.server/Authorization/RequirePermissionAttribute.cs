using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Multideck.Server.Authorization;

/// <summary>
/// Controller-friendly counterpart to the minimal-API <c>RequirePermission</c> extension.
/// Reuses <see cref="IUserPermissionService"/> so controllers and endpoints share one
/// source of truth for permission checks.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class RequirePermissionAttribute(string permissionValue) : Attribute, IAsyncAuthorizationFilter
{
    public string PermissionValue { get; } = permissionValue;

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var permissions = context.HttpContext.RequestServices.GetRequiredService<IUserPermissionService>();
        var granted = await permissions.HasPermissionAsync(user, PermissionValue, context.HttpContext.RequestAborted);
        if (!granted)
        {
            context.Result = new ForbidResult();
        }
    }
}
