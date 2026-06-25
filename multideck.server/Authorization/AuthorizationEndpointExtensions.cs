using Microsoft.AspNetCore.Authorization;

namespace Multideck.Server.Authorization;

public static class AuthorizationEndpointExtensions
{
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, PermissionDefinition permission)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.RequireAuthorization(policy =>
        {
            policy.RequireAuthenticatedUser();
            policy.AddRequirements(new PermissionRequirement(permission.Value));
        });

        return builder;
    }
}
