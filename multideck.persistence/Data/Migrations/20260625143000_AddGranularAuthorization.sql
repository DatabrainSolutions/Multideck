START TRANSACTION;

CREATE TABLE "sys_Permissions" (
    "sys_Permission_ID" uuid NOT NULL DEFAULT (gen_random_uuid()),
    "sys_Permission_Value" character varying(120) NOT NULL,
    "sys_Permission_Group" character varying(50) NOT NULL,
    "sys_Permission_Name" character varying(100) NOT NULL,
    "sys_Permission_Description" character varying(500) NOT NULL,
    "sys_Permission_IsDangerous" boolean NOT NULL DEFAULT FALSE,
    "sys_Permission_CreatedAtUtc" timestamp without time zone NOT NULL DEFAULT (now()),
    CONSTRAINT "PK_sys_Permissions" PRIMARY KEY ("sys_Permission_ID")
);

CREATE TABLE "sys_UserRole_Permissions" (
    "sys_UserRole_ID" uuid NOT NULL,
    "sys_Permission_ID" uuid NOT NULL,
    CONSTRAINT "PK_sys_UserRole_Permissions" PRIMARY KEY ("sys_UserRole_ID", "sys_Permission_ID"),
    CONSTRAINT "FK_sys_UserRole_Permissions_sys_Permissions" FOREIGN KEY ("sys_Permission_ID") REFERENCES "sys_Permissions" ("sys_Permission_ID"),
    CONSTRAINT "FK_sys_UserRole_Permissions_sys_UserRoles" FOREIGN KEY ("sys_UserRole_ID") REFERENCES "sys_UserRoles" ("sys_UserRole_ID")
);

CREATE INDEX "IX_sys_UserRole_Permissions_sys_Permission_ID" ON "sys_UserRole_Permissions" ("sys_Permission_ID");
CREATE UNIQUE INDEX "UX_sys_Permissions_Value" ON "sys_Permissions" ("sys_Permission_Value");

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

DO $$
DECLARE
    administrator_role_id uuid;
    operations_manager_role_id uuid;
    operator_role_id uuid;
    viewer_role_id uuid;
BEGIN
    SELECT "sys_UserRole_ID" INTO administrator_role_id FROM public."sys_UserRoles" WHERE "sys_UserRole_Name" = 'Administrator' ORDER BY "sys_UserRole_ID" LIMIT 1;
    IF administrator_role_id IS NULL THEN
        INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name") VALUES ('Administrator') RETURNING "sys_UserRole_ID" INTO administrator_role_id;
    END IF;

    SELECT "sys_UserRole_ID" INTO operations_manager_role_id FROM public."sys_UserRoles" WHERE "sys_UserRole_Name" = 'Operations manager' ORDER BY "sys_UserRole_ID" LIMIT 1;
    IF operations_manager_role_id IS NULL THEN
        INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name") VALUES ('Operations manager') RETURNING "sys_UserRole_ID" INTO operations_manager_role_id;
    END IF;

    SELECT "sys_UserRole_ID" INTO operator_role_id FROM public."sys_UserRoles" WHERE "sys_UserRole_Name" = 'Operator' ORDER BY "sys_UserRole_ID" LIMIT 1;
    IF operator_role_id IS NULL THEN
        INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name") VALUES ('Operator') RETURNING "sys_UserRole_ID" INTO operator_role_id;
    END IF;

    SELECT "sys_UserRole_ID" INTO viewer_role_id FROM public."sys_UserRoles" WHERE "sys_UserRole_Name" = 'Viewer' ORDER BY "sys_UserRole_ID" LIMIT 1;
    IF viewer_role_id IS NULL THEN
        INSERT INTO public."sys_UserRoles" ("sys_UserRole_Name") VALUES ('Viewer') RETURNING "sys_UserRole_ID" INTO viewer_role_id;
    END IF;

    INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
    SELECT administrator_role_id, permission."sys_Permission_ID" FROM public."sys_Permissions" permission
    ON CONFLICT DO NOTHING;

    INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
    SELECT operations_manager_role_id, permission."sys_Permission_ID" FROM public."sys_Permissions" permission
    WHERE permission."sys_Permission_Value" = ANY (ARRAY['Shipments.Read', 'Shipments.Write', 'Customers.Read', 'Customers.Write', 'Quotes.Read', 'Quotes.Write', 'Reports.Read', 'Reports.Write', 'Users.Read', 'Users.Invite', 'Users.Manage', 'Authorization.Read', 'Settings.Read', 'Settings.Manage', 'Integrations.Read', 'AgentDexter.Read', 'AgentDexter.Manage'])
    ON CONFLICT DO NOTHING;

    INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
    SELECT operator_role_id, permission."sys_Permission_ID" FROM public."sys_Permissions" permission
    WHERE permission."sys_Permission_Value" = ANY (ARRAY['Shipments.Read', 'Shipments.Write', 'Customers.Read', 'Customers.Write', 'Quotes.Read', 'Quotes.Write', 'Reports.Read', 'Users.Read', 'Settings.Read', 'Integrations.Read', 'AgentDexter.Read'])
    ON CONFLICT DO NOTHING;

    INSERT INTO public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
    SELECT viewer_role_id, permission."sys_Permission_ID" FROM public."sys_Permissions" permission
    WHERE permission."sys_Permission_Value" = ANY (ARRAY['Shipments.Read', 'Customers.Read', 'Quotes.Read', 'Reports.Read', 'Users.Read', 'Settings.Read', 'Integrations.Read', 'AgentDexter.Read'])
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

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260625143000_AddGranularAuthorization', '10.0.9');

COMMIT;
