namespace Multideck.Server.Authorization;

/// <summary>
/// Source of truth for Multideck permission values. Keep raw permission strings in this class and use these definitions everywhere else.
/// </summary>
public static class AppPermissions
{
    public static class Shipments
    {
        public static readonly PermissionDefinition Read = new("Shipments.Read", "Shipments", "Read shipments", "View shipment records, milestones, cargo, and routing.");
        public static readonly PermissionDefinition Write = new("Shipments.Write", "Shipments", "Create and update shipments", "Create shipments and update shipment operations data.");
        public static readonly PermissionDefinition Delete = new("Shipments.Delete", "Shipments", "Delete shipments", "Delete shipment records and their operational history.", IsDangerous: true);
    }

    public static class Customers
    {
        public static readonly PermissionDefinition Read = new("Customers.Read", "Customers", "Read customers", "View customer accounts, contacts, and CRM context.");
        public static readonly PermissionDefinition Write = new("Customers.Write", "Customers", "Create and update customers", "Create customers and update customer profile data.");
        public static readonly PermissionDefinition Delete = new("Customers.Delete", "Customers", "Delete customers", "Delete customer records and linked commercial context.", IsDangerous: true);
    }

    public static class Quotes
    {
        public static readonly PermissionDefinition Read = new("Quotes.Read", "Quotes", "Read quotes", "View quotes, revisions, costs, and customer revenue options.");
        public static readonly PermissionDefinition Write = new("Quotes.Write", "Quotes", "Create and update quotes", "Create quotes, revise options, and update quote charges.");
        public static readonly PermissionDefinition Delete = new("Quotes.Delete", "Quotes", "Delete quotes", "Delete quotes and quote revisions.", IsDangerous: true);
    }

    public static class Reports
    {
        public static readonly PermissionDefinition Read = new("Reports.Read", "Reports", "Read reports", "View dashboards, reports, and customer-facing report packs.");
        public static readonly PermissionDefinition Write = new("Reports.Write", "Reports", "Create and update reports", "Create report templates and publish report changes.");
    }

    public static class Users
    {
        public static readonly PermissionDefinition Read = new("Users.Read", "Users", "Read users", "View team users, offices, and role assignments.");
        public static readonly PermissionDefinition Invite = new("Users.Invite", "Users", "Invite users", "Invite teammates and create linked Multideck user profiles.");
        public static readonly PermissionDefinition Manage = new("Users.Manage", "Users", "Manage users", "Change team user offices and role assignments.");
    }

    public static class Authorization
    {
        public static readonly PermissionDefinition Read = new("Authorization.Read", "Authorization", "Read authorization", "View permission definitions, role permissions, and user role assignments.");
        public static readonly PermissionDefinition Manage = new("Authorization.Manage", "Authorization", "Manage authorization", "Change role permissions and assign roles to users.", IsDangerous: true);
    }

    public static class Settings
    {
        public static readonly PermissionDefinition Read = new("Settings.Read", "Settings", "Read workspace settings", "View workspace preferences, branding, integrations, and billing settings.");
        public static readonly PermissionDefinition Manage = new("Settings.Manage", "Settings", "Manage workspace settings", "Change workspace preferences, branding, integrations, and billing settings.");
    }

    public static class Integrations
    {
        public static readonly PermissionDefinition Read = new("Integrations.Read", "Integrations", "Read integrations", "View connected systems, API keys, and webhook configuration.");
        public static readonly PermissionDefinition Manage = new("Integrations.Manage", "Integrations", "Manage integrations", "Create and update integrations, API keys, and webhook configuration.", IsDangerous: true);
    }

    public static class AgentDexter
    {
        public static readonly PermissionDefinition Read = new("AgentDexter.Read", "Agent Dexter", "Read Agent Dexter settings", "View AI agent preferences, watchers, and approval rules.");
        public static readonly PermissionDefinition Manage = new("AgentDexter.Manage", "Agent Dexter", "Manage Agent Dexter", "Change AI agent autonomy, watchers, and approval rules.");
    }

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        Shipments.Read,
        Shipments.Write,
        Shipments.Delete,
        Customers.Read,
        Customers.Write,
        Customers.Delete,
        Quotes.Read,
        Quotes.Write,
        Quotes.Delete,
        Reports.Read,
        Reports.Write,
        Users.Read,
        Users.Invite,
        Users.Manage,
        Authorization.Read,
        Authorization.Manage,
        Settings.Read,
        Settings.Manage,
        Integrations.Read,
        Integrations.Manage,
        AgentDexter.Read,
        AgentDexter.Manage,
    ];

    public static IReadOnlyDictionary<string, PermissionDefinition> ByValue { get; } =
        All.ToDictionary(permission => permission.Value, StringComparer.OrdinalIgnoreCase);
}
