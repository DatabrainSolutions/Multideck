namespace Multideck.Server.Authorization;

public sealed record SystemRoleDefinition(
    string Name,
    string Description,
    IReadOnlyCollection<PermissionDefinition> Permissions,
    bool CanEditPermissions = true);

public static class SystemRoleDefinitions
{
    public static readonly SystemRoleDefinition Administrator = new(
        "Administrator",
        "Full workspace administration across users, roles, data, integrations, and billing.",
        AppPermissions.All,
        CanEditPermissions: false);

    public static readonly SystemRoleDefinition OperationsManager = new(
        "Operations manager",
        "Manage day-to-day freight operations, users, reports, and customer work without changing authorization rules.",
        [
            AppPermissions.Shipments.Read,
            AppPermissions.Shipments.Write,
            AppPermissions.Customers.Read,
            AppPermissions.Customers.Write,
            AppPermissions.Quotes.Read,
            AppPermissions.Quotes.Write,
            AppPermissions.Reports.Read,
            AppPermissions.Reports.Write,
            AppPermissions.Users.Read,
            AppPermissions.Users.Invite,
            AppPermissions.Users.Manage,
            AppPermissions.Authorization.Read,
            AppPermissions.Settings.Read,
            AppPermissions.Settings.Manage,
            AppPermissions.Integrations.Read,
            AppPermissions.AgentDexter.Read,
            AppPermissions.AgentDexter.Manage,
        ]);

    public static readonly SystemRoleDefinition Operator = new(
        "Operator",
        "Create and update operational freight records while keeping destructive and admin actions restricted.",
        [
            AppPermissions.Shipments.Read,
            AppPermissions.Shipments.Write,
            AppPermissions.Customers.Read,
            AppPermissions.Customers.Write,
            AppPermissions.Quotes.Read,
            AppPermissions.Quotes.Write,
            AppPermissions.Reports.Read,
            AppPermissions.Users.Read,
            AppPermissions.Settings.Read,
            AppPermissions.Integrations.Read,
            AppPermissions.AgentDexter.Read,
        ]);

    public static readonly SystemRoleDefinition Viewer = new(
        "Viewer",
        "Read-only access for people who need visibility without operational edit rights.",
        [
            AppPermissions.Shipments.Read,
            AppPermissions.Customers.Read,
            AppPermissions.Quotes.Read,
            AppPermissions.Reports.Read,
            AppPermissions.Users.Read,
            AppPermissions.Settings.Read,
            AppPermissions.Integrations.Read,
            AppPermissions.AgentDexter.Read,
        ]);

    public static IReadOnlyList<SystemRoleDefinition> All { get; } =
    [
        Administrator,
        OperationsManager,
        Operator,
        Viewer,
    ];

    public static SystemRoleDefinition? FindByName(string roleName)
    {
        return All.FirstOrDefault(role => string.Equals(role.Name, roleName, StringComparison.OrdinalIgnoreCase));
    }
}
