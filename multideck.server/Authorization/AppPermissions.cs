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
        public const string ReadValue = "Customers.Read";
        public const string WriteValue = "Customers.Write";

        public static readonly PermissionDefinition Read = new(ReadValue, "Customers", "Read customers", "View customer accounts, contacts, and CRM context.");
        public static readonly PermissionDefinition Write = new(WriteValue, "Customers", "Create and update customers", "Create customers and update customer profile data.");
        public static readonly PermissionDefinition Delete = new("Customers.Delete", "Customers", "Delete customers", "Delete customer records and linked commercial context.", IsDangerous: true);
    }

    public static class Quotes
    {
        public const string ReadValue = "Quotes.Read";

        public static readonly PermissionDefinition Read = new(ReadValue, "Quotes", "Read quotes", "View quotes, revisions, costs, and customer revenue options.");
        public static readonly PermissionDefinition Write = new("Quotes.Write", "Quotes", "Create and update quotes", "Create quotes, revise options, and update quote charges.");
        public static readonly PermissionDefinition Delete = new("Quotes.Delete", "Quotes", "Delete quotes", "Delete quotes and quote revisions.", IsDangerous: true);
    }

    public static class Reports
    {
        public static readonly PermissionDefinition Read = new("Reports.Read", "Reports", "Read reports", "View dashboards, reports, and customer-facing report packs.");
        public static readonly PermissionDefinition Write = new("Reports.Write", "Reports", "Create and update reports", "Create report templates and publish report changes.");
    }

    public static class Warehouse
    {
        // Raw permission strings live here as consts so they can also be used in attribute arguments.
        public const string ReadValue = "Warehouse.Read";
        public const string WriteValue = "Warehouse.Write";

        public static readonly PermissionDefinition Read = new(ReadValue, "Warehouse", "Read warehouse", "View warehouse dashboard, products, stock, orders, movements, work items, and calendar.");
        public static readonly PermissionDefinition Write = new(WriteValue, "Warehouse", "Create and update warehouse", "Create and update warehouse products, stock, orders, movements, work items, and calendar entries.");
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
        public const string ReadValue = "Settings.Read";
        public const string ManageValue = "Settings.Manage";

        public static readonly PermissionDefinition Read = new(ReadValue, "Settings", "Read workspace settings", "View workspace preferences, branding, integrations, and billing settings.");
        public static readonly PermissionDefinition Manage = new(ManageValue, "Settings", "Manage workspace settings", "Change workspace preferences, branding, integrations, and billing settings.");
    }

    public static class Integrations
    {
        public const string ManageValue = "Integrations.Manage";

        public static readonly PermissionDefinition Read = new("Integrations.Read", "Integrations", "Read integrations", "View connected systems, API keys, and webhook configuration.");
        public static readonly PermissionDefinition Manage = new(ManageValue, "Integrations", "Manage integrations", "Create and update integrations, API keys, and webhook configuration.", IsDangerous: true);
    }

    public static class Email
    {
        public const string ConnectValue = "Email.Connect";
        public const string ReadValue = "Email.Read";
        public const string SendValue = "Email.Send";
        public const string ManageSharedValue = "Email.ManageShared";
        public const string AiReadValue = "Email.AIRead";

        public static readonly PermissionDefinition Connect = new(ConnectValue, "Email", "Connect email accounts", "Connect or revoke Gmail and Microsoft 365 accounts.", IsDangerous: true);
        public static readonly PermissionDefinition Read = new(ReadValue, "Email", "Read email", "Read authorised personal, shared, and group mailboxes.");
        public static readonly PermissionDefinition Send = new(SendValue, "Email", "Send email", "Compose, reply, reply all, and forward from authorised mailboxes.", IsDangerous: true);
        public static readonly PermissionDefinition ManageShared = new(ManageSharedValue, "Email", "Manage shared mailboxes", "Manage users and send-as access for shared or group mailboxes.", IsDangerous: true);
        public static readonly PermissionDefinition AiRead = new(AiReadValue, "Email", "Summarise email with AI", "Allow Luna to read an authorised thread for summarisation.", IsDangerous: true);
    }

    public static class AgentDexter
    {
        public const string ReadValue = "AgentDexter.Read";
        public const string ManageValue = "AgentDexter.Manage";

        public static readonly PermissionDefinition Read = new(ReadValue, "Agent Dexter", "Read Agent Dexter settings", "View AI agent preferences, watchers, and approval rules.");
        public static readonly PermissionDefinition Manage = new(ManageValue, "Agent Dexter", "Manage Agent Dexter", "Change AI agent autonomy, watchers, and approval rules.");
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
        Warehouse.Read,
        Warehouse.Write,
        Users.Read,
        Users.Invite,
        Users.Manage,
        Authorization.Read,
        Authorization.Manage,
        Settings.Read,
        Settings.Manage,
        Integrations.Read,
        Integrations.Manage,
        Email.Connect,
        Email.Read,
        Email.Send,
        Email.ManageShared,
        Email.AiRead,
        AgentDexter.Read,
        AgentDexter.Manage,
    ];

    public static IReadOnlyDictionary<string, PermissionDefinition> ByValue { get; } =
        All.ToDictionary(permission => permission.Value, StringComparer.OrdinalIgnoreCase);
}
