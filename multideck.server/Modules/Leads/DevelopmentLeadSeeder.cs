using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Leads;

public static class DevelopmentLeadSeeder
{
    private const string SeedFlag = "Features:SeedDemoCrmLeadsOnStartup";
    private const string SeedMarker = "multideck-development-crm-leads-v1";
    private static readonly Guid DemoBaseCurrencyId = Guid.Parse("de000001-5eed-4ead-8000-000000000001");

    private static readonly DemoLead[] DemoLeads =
    [
        new(
            Guid.Parse("de100001-5eed-4ead-8000-000000000001"),
            "Northstar Components",
            "Amelia Hart",
            "amelia.hart@example.test",
            "GB",
            "quote_request",
            "qualified",
            "hot",
            0,
            "Ocean freight",
            "Shanghai → Felixstowe",
            180_000m,
            "GBP",
            88m,
            0.82m,
            -12,
            -1,
            "Commercial discovery completed",
            "Confirmed weekly import profile and decision process.",
            "meeting",
            true,
            true,
            true,
            true),
        new(
            Guid.Parse("de100002-5eed-4ead-8000-000000000002"),
            "Atelier Maison",
            "Camille Laurent",
            "camille.laurent@example.test",
            "FR",
            "website",
            "working",
            "warm",
            1,
            "European road freight",
            "Lyon → Birmingham",
            72_000m,
            "EUR",
            64m,
            0.56m,
            -4,
            -1,
            "Follow-up email opened",
            "Requested options for a time-sensitive furniture launch.",
            "email",
            false,
            true,
            true,
            true),
        new(
            Guid.Parse("de100003-5eed-4ead-8000-000000000003"),
            "Kestrel Outdoor",
            "Theo Bennett",
            "theo.bennett@example.test",
            "GB",
            "referral",
            "new",
            "warm",
            0,
            "Air and ocean comparison",
            "Shenzhen → Manchester",
            48_000m,
            "GBP",
            null,
            0.43m,
            -3,
            3,
            null,
            null,
            null,
            null,
            null,
            null,
            null),
        new(
            Guid.Parse("de100004-5eed-4ead-8000-000000000004"),
            "Bergstrom Foods",
            "Ingrid Bergstrom",
            "ingrid.bergstrom@example.test",
            "SE",
            "campaign",
            "nurture",
            "cold",
            2,
            "Temperature-controlled freight",
            "Gothenburg → London",
            null,
            null,
            38m,
            0.24m,
            -21,
            null,
            "Seasonal planning note sent",
            "Interest confirmed for the next seasonal buying window.",
            "email",
            false,
            false,
            true,
            false),
        new(
            Guid.Parse("de100005-5eed-4ead-8000-000000000005"),
            "Meridian Medical",
            "Dr Priya Shah",
            "priya.shah@example.test",
            "GB",
            "email",
            "quote_requested",
            "hot",
            1,
            "Priority air freight",
            "Frankfurt → Heathrow",
            260_000m,
            "GBP",
            92m,
            0.89m,
            0,
            0,
            "Quote scope confirmed",
            "Validated controlled-temperature handling and delivery SLA.",
            "call",
            true,
            true,
            true,
            true),
        new(
            Guid.Parse("de100006-5eed-4ead-8000-000000000006"),
            "Fjord Living",
            "Maja Lind",
            "maja.lind@example.test",
            "DK",
            "agent",
            "dormant",
            "cold",
            2,
            "LCL consolidation",
            "Aarhus → Southampton",
            null,
            null,
            29m,
            0.14m,
            -76,
            -30,
            "Re-engagement call attempted",
            "Previous project paused while the product range is reviewed.",
            "call",
            false,
            false,
            true,
            false),
        new(
            Guid.Parse("de100007-5eed-4ead-8000-000000000007"),
            "Horizon Robotics",
            "Kenji Mori",
            "kenji.mori@example.test",
            "JP",
            "manual",
            "converted",
            "hot",
            3,
            "High-value air freight",
            "Tokyo → Amsterdam",
            420_000m,
            "USD",
            96m,
            0.97m,
            -2,
            null,
            "Commercial handover completed",
            "Qualified scope passed to the opportunity team.",
            "meeting",
            true,
            true,
            true,
            true),
        new(
            Guid.Parse("de100008-5eed-4ead-8000-000000000008"),
            "Atlas Circular",
            "Nadia Okafor",
            "nadia.okafor@example.test",
            "NL",
            "import_list",
            "disqualified",
            "cold",
            null,
            "Recycled material logistics",
            "Rotterdam → Dublin",
            null,
            null,
            18m,
            0.08m,
            -90,
            null,
            null,
            null,
            null,
            false,
            false,
            false,
            false),
    ];

    private static readonly IReadOnlyDictionary<Guid, DemoCompany> DemoCompanies = new Dictionary<Guid, DemoCompany>
    {
        [Guid.Parse("de100001-5eed-4ead-8000-000000000001")] = new(
            "northstar-components.example.test",
            "hello@northstar-components.example.test",
            "+44 121 555 0142",
            "+44 121 555 0188",
            "supply_chain_manager",
            "Foundry House",
            "Birmingham",
            "B4 6QE",
            "United Kingdom",
            [
                new("James Harrison", "james.harrison@northstar-components.example.test", "procurement_director", -5),
                new("Maya Chen", "maya.chen@northstar-components.example.test", "logistics_manager", -8),
                new("Oliver Grant", "oliver.grant@northstar-components.example.test", "finance_manager", -12),
            ]),
        [Guid.Parse("de100002-5eed-4ead-8000-000000000002")] = new(
            "atelier-maison.example.test",
            "bonjour@atelier-maison.example.test",
            "+33 4 72 55 01 40",
            "+33 4 72 55 01 46",
            "operations_director",
            "18 Rue des Ateliers",
            "Lyon",
            "69002",
            "France",
            [
                new("Élise Moreau", "elise.moreau@atelier-maison.example.test", "logistics_manager", -3),
                new("Nicolas Bernard", "nicolas.bernard@atelier-maison.example.test", "finance_manager", -7),
            ]),
        [Guid.Parse("de100003-5eed-4ead-8000-000000000003")] = new(
            "kestrel-outdoor.example.test",
            "hello@kestrel-outdoor.example.test",
            "+44 161 555 0260",
            "+44 161 555 0264",
            "founder",
            "Trafford Park",
            "Manchester",
            "M17 1AB",
            "United Kingdom",
            [
                new("Nina Clarke", "nina.clarke@kestrel-outdoor.example.test", "operations_manager", -2),
            ]),
        [Guid.Parse("de100004-5eed-4ead-8000-000000000004")] = new(
            "bergstrom-foods.example.test",
            "trade@bergstrom-foods.example.test",
            "+46 31 555 0780",
            "+46 31 555 0784",
            "operations_director",
            "12 Hamngatan",
            "Gothenburg",
            "411 10",
            "Sweden",
            []),
        [Guid.Parse("de100005-5eed-4ead-8000-000000000005")] = new(
            "meridian-medical.example.test",
            "logistics@meridian-medical.example.test",
            "+44 20 7946 0320",
            "+44 20 7946 0326",
            "quality_manager",
            "22 Medical Park",
            "London",
            "TW6 2GA",
            "United Kingdom",
            [
                new("Elena Fischer", "elena.fischer@meridian-medical.example.test", "quality_manager", -2),
                new("Markus Vogel", "markus.vogel@meridian-medical.example.test", "logistics_manager", -4),
            ]),
        [Guid.Parse("de100006-5eed-4ead-8000-000000000006")] = new(
            "fjord-living.example.test",
            "supply@fjord-living.example.test",
            "+45 70 55 08 10",
            "+45 70 55 08 14",
            "founder",
            "8 Havnevej",
            "Aarhus",
            "8000",
            "Denmark",
            []),
        [Guid.Parse("de100007-5eed-4ead-8000-000000000007")] = new(
            "horizon-robotics.example.test",
            "supply-chain@horizon-robotics.example.test",
            "+81 3 5550 0910",
            "+81 3 5550 0916",
            "supply_chain_manager",
            "4-2 Marunouchi",
            "Tokyo",
            "100-0005",
            "Japan",
            []),
        [Guid.Parse("de100008-5eed-4ead-8000-000000000008")] = new(
            "atlas-circular.example.test",
            "hello@atlas-circular.example.test",
            "+31 10 555 1040",
            "+31 10 555 1046",
            "operations_manager",
            "31 Circular Quay",
            "Rotterdam",
            "3011 AA",
            "Netherlands",
            []),
    };

    public static async Task<WebApplication> SeedDevelopmentCrmLeadsAsync(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment() || !app.Configuration.GetValue<bool>(SeedFlag))
        {
            return app;
        }

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MultideckContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("MultideckDemoCrmLeads");
        var ownerCompanyId = await db.CmpUsers
            .AsNoTracking()
            .Where(user => user.CompanyId != null && user.AuthUserId != null)
            .OrderBy(user => user.UserEmail)
            .Select(user => user.CompanyId)
            .FirstOrDefaultAsync();

        var ownerIds = ownerCompanyId is null
            ? []
            : await db.CmpUsers
                .AsNoTracking()
                .Where(user => user.CompanyId == ownerCompanyId)
                .OrderBy(user => user.UserEmail)
                .Select(user => user.UserId)
                .Take(4)
                .ToArrayAsync();

        var leadIds = DemoLeads.Select(lead => lead.Id).ToArray();
        var existingLeads = await db.CrmLeads
            .Where(lead => leadIds.Contains(lead.CrmleadId))
            .Select(lead => new { lead.CrmleadId, lead.CrmleadMetadataJson })
            .ToListAsync();
        var managedLeadIds = existingLeads
            .Where(lead => lead.CrmleadMetadataJson.Contains(SeedMarker))
            .Select(lead => lead.CrmleadId)
            .ToHashSet();
        var occupiedLeadIds = existingLeads.Select(lead => lead.CrmleadId).ToHashSet();
        var now = DateTime.UtcNow;
        var insertedLeads = 0;

        foreach (var demo in DemoLeads.Where(demo => !occupiedLeadIds.Contains(demo.Id)))
        {
            var ownerId = demo.OwnerIndex is int ownerIndex && ownerIds.Length > 0
                ? ownerIds[ownerIndex % ownerIds.Length]
                : (Guid?)null;
            var createdAt = now.AddDays(demo.CreatedDays);
            db.CrmLeads.Add(new CrmLead
            {
                CrmleadId = demo.Id,
                CrmleadSourceCode = demo.SourceCode,
                CrmleadStatusCode = demo.StatusCode,
                CrmleadRatingCode = demo.RatingCode,
                CrmleadOwnerUserId = ownerId,
                CrmleadCompanyName = demo.CompanyName,
                CrmleadPersonName = demo.ContactName,
                CrmleadEmail = demo.ContactEmail,
                CrmleadPhone = DemoCompanies[demo.Id].PrimaryPhone,
                CrmleadCountryCode = demo.CountryCode,
                CrmleadTradeLane = demo.TradeLane,
                CrmleadServiceInterest = demo.ServiceInterest,
                CrmleadEstimatedValueAmount = demo.ValueAmount,
                CrmleadEstimatedValueCurrencyCode = demo.ValueCurrency,
                CrmleadScore = demo.QualificationScore,
                CrmleadAiprobabilityToConvert = demo.ConversionProbability,
                CrmleadLastInteractionAt = demo.ActivityDays is int activityDays ? now.AddDays(activityDays) : null,
                CrmleadNextActionDueAt = demo.FollowUpDays is int followUpDays ? now.AddDays(followUpDays) : null,
                CrmleadDisqualifiedReason = demo.StatusCode == "disqualified" ? "No active freight requirement in the current planning cycle." : null,
                CrmleadCustomerCentricNeed = demo.ActivitySummary,
                CrmleadMetadataJson = LeadMetadata(DemoCompanies[demo.Id]),
                CrmleadCreatedAt = createdAt,
                CrmleadCreatedBy = ownerId,
                CrmleadUpdatedAt = now,
                CrmleadUpdatedBy = ownerId,
                CrmleadIsDeleted = false,
            });
            managedLeadIds.Add(demo.Id);
            insertedLeads++;
        }

        if (insertedLeads > 0)
        {
            await db.SaveChangesAsync();
        }

        var managedLeads = await db.CrmLeads
            .Where(lead => managedLeadIds.Contains(lead.CrmleadId))
            .ToListAsync();
        var managedDemoLeads = DemoLeads
            .Where(demo => managedLeadIds.Contains(demo.Id))
            .ToDictionary(demo => demo.Id);
        var relatedRecordsAdded = 0;
        var baseCurrencyId = managedLeads.Count > 0
            ? await GetOrCreateBaseCurrencyIdAsync(db)
            : Guid.Empty;

        foreach (var lead in managedLeads)
        {
            var demo = managedDemoLeads[lead.CrmleadId];
            var company = DemoCompanies[lead.CrmleadId];
            var organisationId = RelatedId(lead.CrmleadId, 0xC1);
            var accountCode = $"DEMO-{lead.CrmleadId:N}"[..13].ToUpperInvariant();

            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO "Org_Master"
                    ("Org_id", "Org_Name", "Org_BaseCurrency", "Org_CRMIsLead", "Org_CRMIsPotentialCustomer", "Org_CRMUpdatedAt", "Org_AccCode")
                VALUES
                    (
                        {organisationId},
                        {demo.CompanyName},
                        {baseCurrencyId},
                        TRUE,
                        FALSE,
                        {now},
                        {accountCode}
                    )
                ON CONFLICT ("Org_id") DO NOTHING
                """);

            lead.CrmleadOrgId = organisationId;
            lead.CrmleadPrimaryContactId = RelatedId(lead.CrmleadId, 0xC3, 0);
            lead.CrmleadPhone = company.PrimaryPhone;
            lead.CrmleadMetadataJson = LeadMetadata(company);
        }

        var addressIds = managedLeads
            .Select(lead => RelatedId(lead.CrmleadId, 0xC2))
            .ToArray();
        var existingAddressIds = (await db.OrgAddresses
            .Where(address => addressIds.Contains(address.OrgAddId))
            .Select(address => address.OrgAddId)
            .ToListAsync())
            .ToHashSet();

        foreach (var lead in managedLeads)
        {
            var addressId = RelatedId(lead.CrmleadId, 0xC2);
            if (existingAddressIds.Contains(addressId)) continue;

            var demo = managedDemoLeads[lead.CrmleadId];
            var company = DemoCompanies[lead.CrmleadId];
            db.OrgAddresses.Add(new OrgAddress
            {
                OrgAddId = addressId,
                OrgId = RelatedId(lead.CrmleadId, 0xC1),
                OrgNameOverride = demo.CompanyName,
                OrgAddLine1 = company.AddressLine1,
                OrgAddTownCity = company.City,
                OrgAddPostZipCode = company.PostalCode,
                OrgAddCountry = demo.CountryCode,
                OrgAddMainEmail = company.Email,
                OrgAddMainPhone = company.Phone,
            });
            relatedRecordsAdded++;
        }

        var demoContacts = managedLeads
            .SelectMany(lead =>
            {
                var demo = managedDemoLeads[lead.CrmleadId];
                var company = DemoCompanies[lead.CrmleadId];
                return new[]
                {
                    new DemoContact(demo.ContactName, demo.ContactEmail, company.PrimaryRoleCode, demo.ActivityDays),
                }.Concat(company.AdditionalContacts)
                    .Select((contact, index) => new SeedContact(lead.CrmleadId, index, contact));
            })
            .ToArray();
        var contactIds = demoContacts.Select(contact => RelatedId(contact.LeadId, 0xC3, contact.Index)).ToArray();
        var contactEmailIds = demoContacts.Select(contact => RelatedId(contact.LeadId, 0xC4, contact.Index)).ToArray();
        var contactProfileIds = demoContacts.Select(contact => RelatedId(contact.LeadId, 0xC5, contact.Index)).ToArray();
        var existingContactIds = (await db.OrgContacts
            .Where(contact => contactIds.Contains(contact.OrgContactId))
            .Select(contact => contact.OrgContactId)
            .ToListAsync())
            .ToHashSet();
        var existingContactEmailIds = (await db.OrgContactEmails
            .Where(email => contactEmailIds.Contains(email.OrgContactEmailId))
            .Select(email => email.OrgContactEmailId)
            .ToListAsync())
            .ToHashSet();
        var existingContactProfileIds = (await db.CrmContactProfiles
            .Where(profile => contactProfileIds.Contains(profile.CrmcontactId))
            .Select(profile => profile.CrmcontactId)
            .ToListAsync())
            .ToHashSet();

        foreach (var seedContact in demoContacts)
        {
            var contactId = RelatedId(seedContact.LeadId, 0xC3, seedContact.Index);
            var emailId = RelatedId(seedContact.LeadId, 0xC4, seedContact.Index);
            var profileId = RelatedId(seedContact.LeadId, 0xC5, seedContact.Index);
            var nameParts = seedContact.Contact.Name.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);

            if (!existingContactIds.Contains(contactId))
            {
                db.OrgContacts.Add(new OrgContact
                {
                    OrgContactId = contactId,
                    OrgId = RelatedId(seedContact.LeadId, 0xC1),
                    OrgContactFirstName = nameParts.FirstOrDefault(),
                    OrgContactLastName = nameParts.Length > 1 ? nameParts[1] : null,
                });
                relatedRecordsAdded++;
            }

            if (!existingContactEmailIds.Contains(emailId))
            {
                db.OrgContactEmails.Add(new OrgContactEmail
                {
                    OrgContactEmailId = emailId,
                    OrgContactEmailEmail = seedContact.Contact.Email,
                    OrgContactEmailType = 1,
                    OrgContactId = contactId,
                });
                relatedRecordsAdded++;
            }

            if (!existingContactProfileIds.Contains(profileId))
            {
                var contactAt = seedContact.Contact.LastContactDays is int days ? now.AddDays(days) : (DateTime?)null;
                db.CrmContactProfiles.Add(new CrmContactProfile
                {
                    CrmcontactId = profileId,
                    CrmcontactOrgContactId = contactId,
                    CrmcontactRoleCode = seedContact.Contact.RoleCode,
                    CrmcontactInfluenceLevel = seedContact.Index == 0 ? "decision_maker" : "influencer",
                    CrmcontactConsentSalesContact = true,
                    CrmcontactConsentMarketing = false,
                    CrmcontactLastContactAt = contactAt,
                    CrmcontactIsTrainingAllowed = false,
                    CrmcontactMetadataJson = $$"""{"seed":"{{SeedMarker}}"}""",
                    CrmcontactCreatedAt = now.AddDays(managedDemoLeads[seedContact.LeadId].CreatedDays),
                    CrmcontactUpdatedAt = contactAt ?? now,
                });
                relatedRecordsAdded++;
            }
        }

        var qualificationIds = DemoLeads
            .Where(demo => demo.QualificationScore is not null)
            .ToDictionary(demo => demo.Id, demo => QualificationId(demo.Id));
        var existingQualificationIds = (await db.CrmLeadQualifications
            .Where(qualification => qualificationIds.Values.Contains(qualification.CrmleadQualId))
            .Select(qualification => qualification.CrmleadQualId)
            .ToListAsync())
            .ToHashSet();
        var insertedQualifications = 0;

        foreach (var demo in DemoLeads.Where(demo => managedLeadIds.Contains(demo.Id) && demo.QualificationScore is not null))
        {
            var qualificationId = qualificationIds[demo.Id];
            if (existingQualificationIds.Contains(qualificationId)) continue;

            var ownerId = demo.OwnerIndex is int ownerIndex && ownerIds.Length > 0
                ? ownerIds[ownerIndex % ownerIds.Length]
                : (Guid?)null;
            db.CrmLeadQualifications.Add(new CrmLeadQualification
            {
                CrmleadQualId = qualificationId,
                CrmleadQualLeadId = demo.Id,
                CrmleadQualHasAuthority = demo.HasAuthority,
                CrmleadQualHasBudget = demo.HasBudget,
                CrmleadQualHasNeed = demo.HasNeed,
                CrmleadQualHasTimeline = demo.HasTimeline,
                CrmleadQualQualificationScore = demo.QualificationScore,
                CrmleadQualQualifiedAt = demo.StatusCode is "qualified" or "quote_requested" or "converted" ? now.AddDays(-2) : null,
                CrmleadQualQualifiedBy = ownerId,
                CrmleadQualMetadataJson = $$"""{"seed":"{{SeedMarker}}"}""",
                CrmleadQualCreatedAt = now.AddDays(demo.CreatedDays),
                CrmleadQualCreatedBy = ownerId,
            });
            insertedQualifications++;
        }

        var activityIds = DemoLeads
            .Where(demo => demo.ActivityTypeCode is not null)
            .ToDictionary(demo => demo.Id, demo => ActivityId(demo.Id));
        var existingActivityIds = (await db.CrmActivities
            .Where(activity => activityIds.Values.Contains(activity.CrmactivityId))
            .Select(activity => activity.CrmactivityId)
            .ToListAsync())
            .ToHashSet();
        var insertedActivities = 0;

        foreach (var demo in DemoLeads.Where(demo => managedLeadIds.Contains(demo.Id) && demo.ActivityTypeCode is not null))
        {
            var activityId = activityIds[demo.Id];
            if (existingActivityIds.Contains(activityId)) continue;

            var ownerId = demo.OwnerIndex is int ownerIndex && ownerIds.Length > 0
                ? ownerIds[ownerIndex % ownerIds.Length]
                : (Guid?)null;
            var activityAt = now.AddDays(demo.ActivityDays ?? 0);
            db.CrmActivities.Add(new CrmActivity
            {
                CrmactivityId = activityId,
                CrmactivityActivityTypeCode = demo.ActivityTypeCode!,
                CrmactivityLeadId = demo.Id,
                CrmactivitySubject = demo.ActivitySubject!,
                CrmactivitySummary = demo.ActivitySummary,
                CrmactivityActivityAt = activityAt,
                CrmactivityOwnerUserId = ownerId,
                CrmactivityIsCustomerVisible = false,
                CrmactivityIsTrainingAllowed = false,
                CrmactivityMetadataJson = $$"""{"seed":"{{SeedMarker}}"}""",
                CrmactivityCreatedAt = activityAt,
                CrmactivityCreatedBy = ownerId,
                CrmactivityUpdatedAt = activityAt,
                CrmactivityUpdatedBy = ownerId,
                CrmactivityIsDeleted = false,
            });
            insertedActivities++;
        }

        if (insertedLeads + insertedQualifications + insertedActivities + relatedRecordsAdded > 0 || db.ChangeTracker.HasChanges())
        {
            await db.SaveChangesAsync();
            logger.LogInformation(
                "Seeded {LeadCount} demo CRM leads, {QualificationCount} qualifications, {ActivityCount} activities, and {RelatedRecordCount} organisation/contact records for the development tenant.",
                insertedLeads,
                insertedQualifications,
                insertedActivities,
                relatedRecordsAdded);
        }

        return app;
    }

    private static async Task<Guid> GetOrCreateBaseCurrencyIdAsync(MultideckContext db)
    {
        var baseCurrencyId = await db.SysCurrencies
            .AsNoTracking()
            .Where(currency => currency.CurrencyCode == "GBP")
            .Select(currency => currency.CurrencyId)
            .FirstOrDefaultAsync();
        if (baseCurrencyId != Guid.Empty)
        {
            return baseCurrencyId;
        }

        baseCurrencyId = await db.SysCurrencies
            .AsNoTracking()
            .OrderBy(currency => currency.CurrencyCode)
            .ThenBy(currency => currency.CurrencyId)
            .Select(currency => currency.CurrencyId)
            .FirstOrDefaultAsync();
        if (baseCurrencyId != Guid.Empty)
        {
            return baseCurrencyId;
        }

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "sys_Currency"
                ("Currency_ID", "Currency_Code", "Currency_Symbol", "Currency_Name", "Currency_UnitName", "Currency_SubUnitName", "Currency_SubUnitRatio")
            VALUES
                ({DemoBaseCurrencyId}, 'GBP', '£', 'Pound sterling', 'Pound', 'Penny', 100)
            ON CONFLICT DO NOTHING
            """);

        baseCurrencyId = await db.SysCurrencies
            .AsNoTracking()
            .Where(currency => currency.CurrencyCode == "GBP" || currency.CurrencyId == DemoBaseCurrencyId)
            .OrderByDescending(currency => currency.CurrencyCode == "GBP")
            .Select(currency => currency.CurrencyId)
            .FirstOrDefaultAsync();

        if (baseCurrencyId == Guid.Empty)
        {
            throw new InvalidOperationException("The development CRM lead seeder could not resolve a base currency.");
        }

        return baseCurrencyId;
    }

    private static Guid QualificationId(Guid leadId)
    {
        var bytes = leadId.ToByteArray();
        bytes[0] = 0xA1;
        return new Guid(bytes);
    }

    private static Guid ActivityId(Guid leadId)
    {
        var bytes = leadId.ToByteArray();
        bytes[0] = 0xB1;
        return new Guid(bytes);
    }

    private static Guid RelatedId(Guid leadId, byte prefix, int index = 0)
    {
        var bytes = leadId.ToByteArray();
        bytes[0] = prefix;
        bytes[1] = checked((byte)index);
        return new Guid(bytes);
    }

    private static string LeadMetadata(DemoCompany company) => JsonSerializer.Serialize(new
    {
        seed = SeedMarker,
        companyWebsite = $"https://{company.Website}",
        companyEmail = company.Email,
        companyPhone = company.Phone,
    });

    private sealed record DemoLead(
        Guid Id,
        string CompanyName,
        string ContactName,
        string ContactEmail,
        string CountryCode,
        string SourceCode,
        string StatusCode,
        string RatingCode,
        int? OwnerIndex,
        string ServiceInterest,
        string TradeLane,
        decimal? ValueAmount,
        string? ValueCurrency,
        decimal? QualificationScore,
        decimal ConversionProbability,
        int CreatedDays,
        int? FollowUpDays,
        string? ActivitySubject,
        string? ActivitySummary,
        string? ActivityTypeCode,
        bool? HasAuthority,
        bool? HasBudget,
        bool? HasNeed,
        bool? HasTimeline)
    {
        public int? ActivityDays => ActivitySubject is null ? null : CreatedDays < -30 ? CreatedDays + 8 : Math.Min(-1, CreatedDays / 2);
    }

    private sealed record DemoCompany(
        string Website,
        string Email,
        string Phone,
        string PrimaryPhone,
        string PrimaryRoleCode,
        string AddressLine1,
        string City,
        string PostalCode,
        string Country,
        DemoContact[] AdditionalContacts);

    private sealed record DemoContact(string Name, string Email, string RoleCode, int? LastContactDays);

    private sealed record SeedContact(Guid LeadId, int Index, DemoContact Contact);
}
