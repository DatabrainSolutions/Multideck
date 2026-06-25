using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Multideck.Persistence;

#nullable disable

namespace Multideck.Persistence.Data.Migrations
{
    [DbContext(typeof(MultideckContext))]
    [Migration("20260625143000_AddGranularAuthorization")]
    public partial class AddGranularAuthorization : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "sys_Permissions",
                columns: table => new
                {
                    sys_Permission_ID = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    sys_Permission_Value = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    sys_Permission_Group = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    sys_Permission_Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    sys_Permission_Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    sys_Permission_IsDangerous = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    sys_Permission_CreatedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sys_Permissions", x => x.sys_Permission_ID);
                });

            migrationBuilder.CreateTable(
                name: "sys_UserRole_Permissions",
                columns: table => new
                {
                    sys_UserRole_ID = table.Column<Guid>(type: "uuid", nullable: false),
                    sys_Permission_ID = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sys_UserRole_Permissions", x => new { x.sys_UserRole_ID, x.sys_Permission_ID });
                    table.ForeignKey(
                        name: "FK_sys_UserRole_Permissions_sys_Permissions",
                        column: x => x.sys_Permission_ID,
                        principalTable: "sys_Permissions",
                        principalColumn: "sys_Permission_ID");
                    table.ForeignKey(
                        name: "FK_sys_UserRole_Permissions_sys_UserRoles",
                        column: x => x.sys_UserRole_ID,
                        principalTable: "sys_UserRoles",
                        principalColumn: "sys_UserRole_ID");
                });

            migrationBuilder.CreateIndex(
                name: "IX_sys_UserRole_Permissions_sys_Permission_ID",
                table: "sys_UserRole_Permissions",
                column: "sys_Permission_ID");

            migrationBuilder.CreateIndex(
                name: "UX_sys_Permissions_Value",
                table: "sys_Permissions",
                column: "sys_Permission_Value",
                unique: true);

            migrationBuilder.Sql(PermissionSeedSql);
            migrationBuilder.Sql(RoleSeedSql);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "sys_UserRole_Permissions");

            migrationBuilder.DropTable(
                name: "sys_Permissions");
        }

        private const string PermissionSeedSql = """
            INSERT INTO public."sys_Permissions" (
                "sys_Permission_Value",
                "sys_Permission_Group",
                "sys_Permission_Name",
                "sys_Permission_Description",
                "sys_Permission_IsDangerous")
            VALUES
                ('Shipments.Read', 'Shipments', 'Read shipments', 'View shipment records, milestones, cargo, and routing.', false),
                ('Shipments.Write', 'Shipments', 'Create and update shipments', 'Create shipments and update shipment operations data.', false),
                ('Shipments.Delete', 'Shipments', 'Delete shipments', 'Delete shipment records and their operational history.', true),
                ('Customers.Read', 'Customers', 'Read customers', 'View customer accounts, contacts, and CRM context.', false),
                ('Customers.Write', 'Customers', 'Create and update customers', 'Create customers and update customer profile data.', false),
                ('Customers.Delete', 'Customers', 'Delete customers', 'Delete customer records and linked commercial context.', true),
                ('Quotes.Read', 'Quotes', 'Read quotes', 'View quotes, revisions, costs, and customer revenue options.', false),
                ('Quotes.Write', 'Quotes', 'Create and update quotes', 'Create quotes, revise options, and update quote charges.', false),
                ('Quotes.Delete', 'Quotes', 'Delete quotes', 'Delete quotes and quote revisions.', true),
                ('Reports.Read', 'Reports', 'Read reports', 'View dashboards, reports, and customer-facing report packs.', false),
                ('Reports.Write', 'Reports', 'Create and update reports', 'Create report templates and publish report changes.', false),
                ('Users.Read', 'Users', 'Read users', 'View team users, offices, and role assignments.', false),
                ('Users.Invite', 'Users', 'Invite users', 'Invite teammates and create linked Multideck user profiles.', false),
                ('Users.Manage', 'Users', 'Manage users', 'Change team user offices and role assignments.', false),
                ('Authorization.Read', 'Authorization', 'Read authorization', 'View permission definitions, role permissions, and user role assignments.', false),
                ('Authorization.Manage', 'Authorization', 'Manage authorization', 'Change role permissions and assign roles to users.', true),
                ('Settings.Read', 'Settings', 'Read workspace settings', 'View workspace preferences, branding, integrations, and billing settings.', false),
                ('Settings.Manage', 'Settings', 'Manage workspace settings', 'Change workspace preferences, branding, integrations, and billing settings.', false),
                ('Integrations.Read', 'Integrations', 'Read integrations', 'View connected systems, API keys, and webhook configuration.', false),
                ('Integrations.Manage', 'Integrations', 'Manage integrations', 'Create and update integrations, API keys, and webhook configuration.', true),
                ('AgentDexter.Read', 'Agent Dexter', 'Read Agent Dexter settings', 'View AI agent preferences, watchers, and approval rules.', false),
                ('AgentDexter.Manage', 'Agent Dexter', 'Manage Agent Dexter', 'Change AI agent autonomy, watchers, and approval rules.', false)
            ON CONFLICT ("sys_Permission_Value") DO UPDATE
            SET "sys_Permission_Group" = EXCLUDED."sys_Permission_Group",
                "sys_Permission_Name" = EXCLUDED."sys_Permission_Name",
                "sys_Permission_Description" = EXCLUDED."sys_Permission_Description",
                "sys_Permission_IsDangerous" = EXCLUDED."sys_Permission_IsDangerous";
            """;

        private const string RoleSeedSql = """
            DO $$
            DECLARE
                administrator_role_id uuid;
                operations_manager_role_id uuid;
                operator_role_id uuid;
                viewer_role_id uuid;
            BEGIN
                SELECT "sys_UserRole_ID"
                INTO administrator_role_id
                FROM public."sys_UserRoles"
                WHERE "sys_UserRole_Name" = 'Administrator'
                ORDER BY "sys_UserRole_ID"
                LIMIT 1;

                IF administrator_role_id IS NULL THEN
                    INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name")
                    VALUES ('Administrator')
                    RETURNING "sys_UserRole_ID" INTO administrator_role_id;
                END IF;

                SELECT "sys_UserRole_ID"
                INTO operations_manager_role_id
                FROM public."sys_UserRoles"
                WHERE "sys_UserRole_Name" = 'Operations manager'
                ORDER BY "sys_UserRole_ID"
                LIMIT 1;

                IF operations_manager_role_id IS NULL THEN
                    INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name")
                    VALUES ('Operations manager')
                    RETURNING "sys_UserRole_ID" INTO operations_manager_role_id;
                END IF;

                SELECT "sys_UserRole_ID"
                INTO operator_role_id
                FROM public."sys_UserRoles"
                WHERE "sys_UserRole_Name" = 'Operator'
                ORDER BY "sys_UserRole_ID"
                LIMIT 1;

                IF operator_role_id IS NULL THEN
                    INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name")
                    VALUES ('Operator')
                    RETURNING "sys_UserRole_ID" INTO operator_role_id;
                END IF;

                SELECT "sys_UserRole_ID"
                INTO viewer_role_id
                FROM public."sys_UserRoles"
                WHERE "sys_UserRole_Name" = 'Viewer'
                ORDER BY "sys_UserRole_ID"
                LIMIT 1;

                IF viewer_role_id IS NULL THEN
                    INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name")
                    VALUES ('Viewer')
                    RETURNING "sys_UserRole_ID" INTO viewer_role_id;
                END IF;

                INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
                SELECT administrator_role_id, permission."sys_Permission_ID"
                FROM public."sys_Permissions" permission
                ON CONFLICT DO NOTHING;

                INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
                SELECT operations_manager_role_id, permission."sys_Permission_ID"
                FROM public."sys_Permissions" permission
                WHERE permission."sys_Permission_Value" = ANY (ARRAY[
                    'Shipments.Read', 'Shipments.Write',
                    'Customers.Read', 'Customers.Write',
                    'Quotes.Read', 'Quotes.Write',
                    'Reports.Read', 'Reports.Write',
                    'Users.Read', 'Users.Invite', 'Users.Manage',
                    'Authorization.Read',
                    'Settings.Read', 'Settings.Manage',
                    'Integrations.Read',
                    'AgentDexter.Read', 'AgentDexter.Manage'
                ])
                ON CONFLICT DO NOTHING;

                INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
                SELECT operator_role_id, permission."sys_Permission_ID"
                FROM public."sys_Permissions" permission
                WHERE permission."sys_Permission_Value" = ANY (ARRAY[
                    'Shipments.Read', 'Shipments.Write',
                    'Customers.Read', 'Customers.Write',
                    'Quotes.Read', 'Quotes.Write',
                    'Reports.Read',
                    'Users.Read',
                    'Settings.Read',
                    'Integrations.Read',
                    'AgentDexter.Read'
                ])
                ON CONFLICT DO NOTHING;

                INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
                SELECT viewer_role_id, permission."sys_Permission_ID"
                FROM public."sys_Permissions" permission
                WHERE permission."sys_Permission_Value" = ANY (ARRAY[
                    'Shipments.Read',
                    'Customers.Read',
                    'Quotes.Read',
                    'Reports.Read',
                    'Users.Read',
                    'Settings.Read',
                    'Integrations.Read',
                    'AgentDexter.Read'
                ])
                ON CONFLICT DO NOTHING;

                INSERT INTO public."cmp_Users_Roles" ("sys_UserRole_ID", "User_ID")
                SELECT administrator_role_id, cmp_user."User_ID"
                FROM public."cmp_Users" cmp_user
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public."cmp_Users_Roles" existing_assignment
                    WHERE existing_assignment."User_ID" = cmp_user."User_ID"
                )
                ON CONFLICT DO NOTHING;
            END $$;
            """;
    }
}
