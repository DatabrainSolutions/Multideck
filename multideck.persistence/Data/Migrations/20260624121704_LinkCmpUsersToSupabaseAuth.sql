START TRANSACTION;
DROP TABLE "cmp_Company_Offices";

ALTER TABLE "cmp_Users" DROP COLUMN "User_LastPasswordChange";

ALTER TABLE "cmp_Users" DROP COLUMN "User_PasswordHash";

ALTER TABLE "cmp_Users" DROP COLUMN "User_PasswordSalt";

ALTER TABLE "cmp_Users" ALTER COLUMN "User_Email" TYPE character varying(320);

ALTER TABLE "cmp_Users" ADD "Auth_User_ID" uuid;

ALTER TABLE "cmp_Offices" ADD "Office_Address" character varying(200);

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

CREATE INDEX "IX_cmp_Users_Company_ID" ON "cmp_Users" ("Company_ID");

CREATE UNIQUE INDEX "UX_cmp_Users_Auth_User_ID" ON "cmp_Users" ("Auth_User_ID");

CREATE INDEX "IX_cmp_Offices_Company_ID" ON "cmp_Offices" ("Company_ID");

ALTER TABLE "cmp_Offices" ADD CONSTRAINT "FK_cmp_Offices_cmp_Company" FOREIGN KEY ("Company_ID") REFERENCES "cmp_Company" ("Company_ID");

ALTER TABLE "cmp_Users" ADD CONSTRAINT "FK_cmp_Users_cmp_Company" FOREIGN KEY ("Company_ID") REFERENCES "cmp_Company" ("Company_ID");

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

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260624121704_LinkCmpUsersToSupabaseAuth', '10.0.9');

COMMIT;

