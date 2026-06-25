using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Multideck.Persistence.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkCmpUsersToSupabaseAuth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cmp_Company_Offices");

            migrationBuilder.DropColumn(
                name: "User_LastPasswordChange",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_PasswordHash",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_PasswordSalt",
                table: "cmp_Users");

            migrationBuilder.AlterColumn<string>(
                name: "User_Email",
                table: "cmp_Users",
                type: "character varying(320)",
                maxLength: 320,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<Guid>(
                name: "Auth_User_ID",
                table: "cmp_Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Office_Address",
                table: "cmp_Offices",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.Sql("""
                DO $$
                DECLARE
                    jenkar_company_id uuid;
                    jenkar_office_id uuid;
                BEGIN
                    SELECT "Company_ID"
                    INTO jenkar_company_id
                    FROM public."cmp_Company"
                    WHERE "Company_Name" = 'Jenkar Shipping Ltd'
                    ORDER BY "Company_ID"
                    LIMIT 1;

                    IF jenkar_company_id IS NULL THEN
                        INSERT INTO public."cmp_Company" ("Company_Name")
                        VALUES ('Jenkar Shipping Ltd')
                        RETURNING "Company_ID" INTO jenkar_company_id;
                    END IF;

                    SELECT "Office_ID"
                    INTO jenkar_office_id
                    FROM public."cmp_Offices"
                    WHERE "Company_ID" = jenkar_company_id
                      AND "Office_Address" = 'Unit C2, Telford Way'
                    ORDER BY "Office_ID"
                    LIMIT 1;

                    IF jenkar_office_id IS NULL THEN
                        SELECT "Office_ID"
                        INTO jenkar_office_id
                        FROM public."cmp_Offices"
                        WHERE "Company_ID" = jenkar_company_id
                        ORDER BY "Office_ID"
                        LIMIT 1;

                        IF jenkar_office_id IS NULL THEN
                            INSERT INTO public."cmp_Offices" ("Office_Name", "Office_Address", "Company_ID")
                            VALUES ('Telford Way', 'Unit C2, Telford Way', jenkar_company_id)
                            RETURNING "Office_ID" INTO jenkar_office_id;
                        ELSE
                            UPDATE public."cmp_Offices"
                            SET "Office_Address" = 'Unit C2, Telford Way'
                            WHERE "Office_ID" = jenkar_office_id;
                        END IF;
                    END IF;

                    UPDATE public."cmp_Offices"
                    SET "Company_ID" = jenkar_company_id
                    WHERE "Office_ID" = jenkar_office_id;

                    UPDATE public."cmp_Offices" office
                    SET "Company_ID" = jenkar_company_id
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM public."cmp_Company" company
                        WHERE company."Company_ID" = office."Company_ID"
                    );

                    UPDATE public."cmp_Users"
                    SET "Company_ID" = jenkar_company_id;

                    UPDATE public."cmp_Users" cmp_user
                    SET "Auth_User_ID" = auth_user.id,
                        "User_Email" = COALESCE(NULLIF(auth_user.email, ''), cmp_user."User_Email"),
                        "User_Firstname" = COALESCE(NULLIF(auth_user.raw_user_meta_data ->> 'first_name', ''), cmp_user."User_Firstname"),
                        "User_Lastname" = COALESCE(NULLIF(auth_user.raw_user_meta_data ->> 'last_name', ''), cmp_user."User_Lastname")
                    FROM auth.users auth_user
                    WHERE cmp_user."Auth_User_ID" IS NULL
                      AND auth_user.email IS NOT NULL
                      AND lower(cmp_user."User_Email") = lower(auth_user.email);

                    WITH raw_name_matches AS (
                        SELECT cmp_user."User_ID", auth_user.id AS "Auth_User_ID"
                        FROM public."cmp_Users" cmp_user
                        JOIN auth.users auth_user
                          ON lower(COALESCE(cmp_user."User_Firstname", '')) = lower(COALESCE(auth_user.raw_user_meta_data ->> 'first_name', ''))
                         AND lower(COALESCE(cmp_user."User_Lastname", '')) = lower(COALESCE(auth_user.raw_user_meta_data ->> 'last_name', ''))
                        WHERE cmp_user."Auth_User_ID" IS NULL
                          AND NULLIF(cmp_user."User_Firstname", '') IS NOT NULL
                          AND NULLIF(cmp_user."User_Lastname", '') IS NOT NULL
                          AND NOT EXISTS (
                              SELECT 1
                              FROM public."cmp_Users" mapped_user
                              WHERE mapped_user."Auth_User_ID" = auth_user.id
                          )
                    ), unique_name_matches AS (
                        SELECT name_match."User_ID", name_match."Auth_User_ID"
                        FROM raw_name_matches name_match
                        WHERE (SELECT COUNT(*) FROM raw_name_matches same_user WHERE same_user."User_ID" = name_match."User_ID") = 1
                          AND (SELECT COUNT(*) FROM raw_name_matches same_auth WHERE same_auth."Auth_User_ID" = name_match."Auth_User_ID") = 1
                    )
                    UPDATE public."cmp_Users" cmp_user
                    SET "Auth_User_ID" = unique_name_matches."Auth_User_ID",
                        "User_Email" = COALESCE(NULLIF(auth_user.email, ''), cmp_user."User_Email"),
                        "User_Firstname" = COALESCE(NULLIF(auth_user.raw_user_meta_data ->> 'first_name', ''), cmp_user."User_Firstname"),
                        "User_Lastname" = COALESCE(NULLIF(auth_user.raw_user_meta_data ->> 'last_name', ''), cmp_user."User_Lastname")
                    FROM unique_name_matches
                    JOIN auth.users auth_user ON auth_user.id = unique_name_matches."Auth_User_ID"
                    WHERE cmp_user."User_ID" = unique_name_matches."User_ID";

                    INSERT INTO public."cmp_Users" ("Auth_User_ID", "Company_ID", "User_Firstname", "User_Lastname", "User_Email")
                    SELECT auth_user.id,
                           jenkar_company_id,
                           NULLIF(auth_user.raw_user_meta_data ->> 'first_name', ''),
                           NULLIF(auth_user.raw_user_meta_data ->> 'last_name', ''),
                           COALESCE(NULLIF(auth_user.email, ''), auth_user.id::text)
                    FROM auth.users auth_user
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM public."cmp_Users" cmp_user
                        WHERE cmp_user."Auth_User_ID" = auth_user.id
                    );

                    INSERT INTO public."cmp_Users_Offices" ("User_ID", "Office_ID")
                    SELECT cmp_user."User_ID", jenkar_office_id
                    FROM public."cmp_Users" cmp_user
                    WHERE cmp_user."Company_ID" = jenkar_company_id
                    ON CONFLICT DO NOTHING;
                END $$;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_cmp_Users_Company_ID",
                table: "cmp_Users",
                column: "Company_ID");

            migrationBuilder.CreateIndex(
                name: "UX_cmp_Users_Auth_User_ID",
                table: "cmp_Users",
                column: "Auth_User_ID",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_cmp_Offices_Company_ID",
                table: "cmp_Offices",
                column: "Company_ID");

            migrationBuilder.AddForeignKey(
                name: "FK_cmp_Offices_cmp_Company",
                table: "cmp_Offices",
                column: "Company_ID",
                principalTable: "cmp_Company",
                principalColumn: "Company_ID");

            migrationBuilder.AddForeignKey(
                name: "FK_cmp_Users_cmp_Company",
                table: "cmp_Users",
                column: "Company_ID",
                principalTable: "cmp_Company",
                principalColumn: "Company_ID");

            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'FK_cmp_Users_auth_users'
                          AND conrelid = 'public."cmp_Users"'::regclass
                    ) THEN
                        ALTER TABLE public."cmp_Users"
                        ADD CONSTRAINT "FK_cmp_Users_auth_users"
                        FOREIGN KEY ("Auth_User_ID") REFERENCES auth.users(id)
                        ON DELETE SET NULL;
                    END IF;
                END $$;

                CREATE OR REPLACE FUNCTION public.sync_cmp_user_from_auth_user()
                RETURNS trigger
                LANGUAGE plpgsql
                SECURITY DEFINER
                SET search_path = public, auth
                AS $$
                DECLARE
                    jenkar_company_id uuid;
                    jenkar_office_id uuid;
                    cmp_user_id uuid;
                BEGIN
                    SELECT "Company_ID"
                    INTO jenkar_company_id
                    FROM public."cmp_Company"
                    WHERE "Company_Name" = 'Jenkar Shipping Ltd'
                    ORDER BY "Company_ID"
                    LIMIT 1;

                    IF jenkar_company_id IS NULL THEN
                        INSERT INTO public."cmp_Company" ("Company_Name")
                        VALUES ('Jenkar Shipping Ltd')
                        RETURNING "Company_ID" INTO jenkar_company_id;
                    END IF;

                    SELECT "Office_ID"
                    INTO jenkar_office_id
                    FROM public."cmp_Offices"
                    WHERE "Company_ID" = jenkar_company_id
                      AND "Office_Address" = 'Unit C2, Telford Way'
                    ORDER BY "Office_ID"
                    LIMIT 1;

                    IF jenkar_office_id IS NULL THEN
                        INSERT INTO public."cmp_Offices" ("Office_Name", "Office_Address", "Company_ID")
                        VALUES ('Telford Way', 'Unit C2, Telford Way', jenkar_company_id)
                        RETURNING "Office_ID" INTO jenkar_office_id;
                    END IF;

                    INSERT INTO public."cmp_Users" ("Auth_User_ID", "Company_ID", "User_Firstname", "User_Lastname", "User_Email")
                    VALUES (
                        NEW.id,
                        jenkar_company_id,
                        NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
                        NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
                        COALESCE(NULLIF(NEW.email, ''), NEW.id::text)
                    )
                    ON CONFLICT ("Auth_User_ID") DO UPDATE
                    SET "Company_ID" = COALESCE("cmp_Users"."Company_ID", EXCLUDED."Company_ID"),
                        "User_Firstname" = COALESCE(EXCLUDED."User_Firstname", "cmp_Users"."User_Firstname"),
                        "User_Lastname" = COALESCE(EXCLUDED."User_Lastname", "cmp_Users"."User_Lastname"),
                        "User_Email" = EXCLUDED."User_Email"
                    RETURNING "User_ID" INTO cmp_user_id;

                    INSERT INTO public."cmp_Users_Offices" ("User_ID", "Office_ID")
                    VALUES (cmp_user_id, jenkar_office_id)
                    ON CONFLICT DO NOTHING;

                    RETURN NEW;
                END;
                $$;

                DROP TRIGGER IF EXISTS on_auth_user_changed_sync_cmp_user ON auth.users;

                CREATE TRIGGER on_auth_user_changed_sync_cmp_user
                AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
                FOR EACH ROW EXECUTE FUNCTION public.sync_cmp_user_from_auth_user();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS on_auth_user_changed_sync_cmp_user ON auth.users;
                DROP FUNCTION IF EXISTS public.sync_cmp_user_from_auth_user();
                ALTER TABLE public."cmp_Users" DROP CONSTRAINT IF EXISTS "FK_cmp_Users_auth_users";
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_cmp_Offices_cmp_Company",
                table: "cmp_Offices");

            migrationBuilder.DropForeignKey(
                name: "FK_cmp_Users_cmp_Company",
                table: "cmp_Users");

            migrationBuilder.DropIndex(
                name: "IX_cmp_Users_Company_ID",
                table: "cmp_Users");

            migrationBuilder.DropIndex(
                name: "UX_cmp_Users_Auth_User_ID",
                table: "cmp_Users");

            migrationBuilder.DropIndex(
                name: "IX_cmp_Offices_Company_ID",
                table: "cmp_Offices");

            migrationBuilder.DropColumn(
                name: "Auth_User_ID",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "Office_Address",
                table: "cmp_Offices");

            migrationBuilder.AlterColumn<string>(
                name: "User_Email",
                table: "cmp_Users",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(320)",
                oldMaxLength: 320);

            migrationBuilder.AddColumn<DateTime>(
                name: "User_LastPasswordChange",
                table: "cmp_Users",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "User_PasswordHash",
                table: "cmp_Users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "User_PasswordSalt",
                table: "cmp_Users",
                type: "bytea",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "cmp_Company_Offices",
                columns: table => new
                {
                    Company_ID = table.Column<Guid>(type: "uuid", nullable: false),
                    Office_ID = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tbl_Company_Office", x => new { x.Company_ID, x.Office_ID });
                    table.ForeignKey(
                        name: "FK_tbl_cmp_Company_Offices_tbl_cmp_Company",
                        column: x => x.Company_ID,
                        principalTable: "cmp_Company",
                        principalColumn: "Company_ID");
                    table.ForeignKey(
                        name: "FK_tbl_cmp_Company_Offices_tbl_cmp_Offices",
                        column: x => x.Office_ID,
                        principalTable: "cmp_Offices",
                        principalColumn: "Office_ID");
                });

            migrationBuilder.CreateIndex(
                name: "IX_cmp_Company_Offices_Office_ID",
                table: "cmp_Company_Offices",
                column: "Office_ID");

            migrationBuilder.Sql("""
                INSERT INTO public."cmp_Company_Offices" ("Company_ID", "Office_ID")
                SELECT "Company_ID", "Office_ID"
                FROM public."cmp_Offices"
                ON CONFLICT DO NOTHING;
                """);
        }
    }
}
