using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Leads;

public sealed class LeadService(MultideckContext db, IWarehouseContext context) : ILeadService
{
    public async Task<IReadOnlyList<LeadDto>> ListAsync(ClaimsPrincipal user, string? search, CancellationToken cancellationToken)
    {
        // Each deployed tenant has its own Supabase project. Requiring the linked current user
        // keeps CRM reads behind the same authenticated workspace boundary as Customers.
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var query = CreateQuery(activityLimit: 1);
        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(lead =>
                (lead.CrmleadCompanyName != null && EF.Functions.ILike(lead.CrmleadCompanyName, pattern)) ||
                (lead.CrmleadPersonName != null && EF.Functions.ILike(lead.CrmleadPersonName, pattern)) ||
                (lead.CrmleadEmail != null && EF.Functions.ILike(lead.CrmleadEmail, pattern)) ||
                (lead.CrmleadOwnerUser != null && EF.Functions.ILike(lead.CrmleadOwnerUser.UserEmail, pattern)));
        }

        var leads = await query
            .OrderBy(lead => lead.CrmleadNextActionDueAt == null)
            .ThenBy(lead => lead.CrmleadNextActionDueAt)
            .ThenByDescending(lead => lead.CrmleadLastInteractionAt)
            .ThenByDescending(lead => lead.CrmleadCreatedAt)
            .ToListAsync(cancellationToken);

        return leads.Select(ToDto).ToList();
    }

    public async Task<LeadDetailDto> GetAsync(ClaimsPrincipal user, Guid leadId, CancellationToken cancellationToken)
    {
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var lead = await CreateQuery(activityLimit: 8)
            .FirstOrDefaultAsync(item => item.CrmleadId == leadId, cancellationToken);
        if (lead is null)
        {
            throw WarehouseException.NotFound("Lead not found.");
        }

        var summary = ToDto(lead);
        var contacts = await LoadContactsAsync(lead, summary, cancellationToken);
        var address = lead.CrmleadOrgId is Guid organisationId
            ? await db.OrgAddresses
                .AsNoTracking()
                .Where(item => item.OrgId == organisationId)
                .OrderByDescending(item => item.OrgAddMainEmail != null)
                .ThenBy(item => item.OrgAddId)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        var companyEmail = Normalize(address?.OrgAddMainEmail) ??
            MetadataValue(lead.CrmleadMetadataJson, "companyEmail", "organisationEmail");
        var companyWebsite = MetadataValue(lead.CrmleadMetadataJson, "companyWebsite", "website", "websiteUrl");
        var companyPhone = Normalize(address?.OrgAddMainPhone) ??
            MetadataValue(lead.CrmleadMetadataJson, "companyPhone", "organisationPhone");
        var companyAddress = address is null
            ? MetadataValue(lead.CrmleadMetadataJson, "companyAddress", "address")
            : JoinAddress(address);
        var activities = lead.CrmActivities
            .OrderByDescending(activity => activity.CrmactivityActivityAt)
            .Take(8)
            .Select(activity => new LeadActivityDto(
                activity.CrmactivityId,
                activity.CrmactivityActivityTypeCode,
                activity.CrmactivitySubject,
                Normalize(activity.CrmactivitySummary),
                activity.CrmactivityActivityAt))
            .ToList();

        return new LeadDetailDto(
            summary,
            new LeadCompanyDto(lead.CrmleadOrgId, companyEmail, companyWebsite, companyPhone, companyAddress),
            contacts,
            activities);
    }

    private async Task<IReadOnlyList<LeadContactDto>> LoadContactsAsync(
        CrmLead lead,
        LeadDto summary,
        CancellationToken cancellationToken)
    {
        var linkedContacts = lead.CrmleadOrgId is Guid organisationId
            ? await db.OrgContacts
                .AsNoTracking()
                .AsSplitQuery()
                .Where(contact => contact.OrgId == organisationId)
                .Include(contact => contact.OrgContactEmails)
                .Include(contact => contact.CrmContactProfile)
                .ToListAsync(cancellationToken)
            : [];
        var contactIds = linkedContacts.Select(contact => contact.OrgContactId).ToArray();
        var phoneIdentities = contactIds.Length == 0
            ? []
            : await db.CommIdentities
                .AsNoTracking()
                .Where(identity =>
                    !identity.CommIdentityIsDeleted &&
                    identity.CommIdentityContactId != null &&
                    contactIds.Contains(identity.CommIdentityContactId.Value) &&
                    (identity.CommIdentityChannelCode == "phone" ||
                     identity.CommIdentityChannelCode == "sms" ||
                     identity.CommIdentityChannelCode == "whatsapp"))
                .OrderByDescending(identity => identity.CommIdentityLastSeenAt ?? identity.CommIdentityUpdatedAt)
                .ToListAsync(cancellationToken);
        var phoneByContact = phoneIdentities
            .GroupBy(identity => identity.CommIdentityContactId!.Value)
            .ToDictionary(
                group => group.Key,
                group => group.Select(identity => Normalize(identity.CommIdentityAddress)).FirstOrDefault(value => value is not null));

        var contacts = linkedContacts
            .Select(contact =>
            {
                var name = PersonName(contact.OrgContactFirstName, contact.OrgContactLastName);
                var isPrimary = lead.CrmleadPrimaryContactId == contact.OrgContactId;
                var email = contact.OrgContactEmails
                    .OrderBy(item => item.OrgContactEmailType)
                    .Select(item => Normalize(item.OrgContactEmailEmail))
                    .FirstOrDefault(value => value is not null);
                var phone = phoneByContact.GetValueOrDefault(contact.OrgContactId);
                if (isPrimary)
                {
                    email ??= Normalize(lead.CrmleadEmail);
                    phone ??= Normalize(lead.CrmleadPhone);
                }

                return new LeadContactDto(
                    contact.OrgContactId,
                    name,
                    Initials(name ?? email ?? "?"),
                    Normalize(contact.CrmContactProfile?.CrmcontactRoleCode),
                    email,
                    phone,
                    isPrimary,
                    contact.CrmContactProfile?.CrmcontactLastContactAt ?? (isPrimary ? summary.LastActivityAt : null));
            })
            .OrderByDescending(contact => contact.IsPrimary)
            .ThenBy(contact => contact.Name)
            .ToList();

        var snapshotName = Normalize(lead.CrmleadPersonName);
        var snapshotEmail = Normalize(lead.CrmleadEmail);
        var snapshotMatchesLinkedContact = contacts.Any(contact =>
            (lead.CrmleadPrimaryContactId is not null && contact.Id == lead.CrmleadPrimaryContactId) ||
            (snapshotEmail is not null && string.Equals(contact.Email, snapshotEmail, StringComparison.OrdinalIgnoreCase)));
        if (!snapshotMatchesLinkedContact && (snapshotName is not null || snapshotEmail is not null || lead.CrmleadPhone is not null))
        {
            contacts.Insert(0, new LeadContactDto(
                lead.CrmleadPrimaryContactId ?? lead.CrmleadId,
                snapshotName,
                Initials(snapshotName ?? snapshotEmail ?? "?"),
                null,
                snapshotEmail,
                Normalize(lead.CrmleadPhone),
                true,
                summary.LastActivityAt));
        }

        return contacts;
    }

    private IQueryable<CrmLead> CreateQuery(int activityLimit) => db.CrmLeads
        .AsNoTracking()
        .AsSplitQuery()
        .Where(lead => !lead.CrmleadIsDeleted)
        .Include(lead => lead.CrmleadPrimaryContact)
            .ThenInclude(contact => contact!.OrgContactEmails)
        .Include(lead => lead.CrmleadSourceCodeNavigation)
        .Include(lead => lead.CrmleadStatusCodeNavigation)
        .Include(lead => lead.CrmleadRatingCodeNavigation)
        .Include(lead => lead.CrmleadOwnerUser)
        .Include(lead => lead.CrmActivities
            .Where(activity => !activity.CrmactivityIsDeleted)
            .OrderByDescending(activity => activity.CrmactivityActivityAt)
            .Take(activityLimit))
        .Include(lead => lead.CrmLeadQualifications
            .OrderByDescending(qualification => qualification.CrmleadQualQualifiedAt ?? qualification.CrmleadQualCreatedAt)
            .Take(1))
        .Include(lead => lead.CrmOpportunities.Where(opportunity =>
            !opportunity.CrmopptyIsDeleted &&
            opportunity.CrmopptyWonAt == null &&
            opportunity.CrmopptyLostAt == null))
            .ThenInclude(opportunity => opportunity.CrmopptyStageCodeNavigation);

    private static LeadDto ToDto(CrmLead lead)
    {
        var linkedContact = lead.CrmleadPrimaryContact;
        var primaryContactName = Normalize(lead.CrmleadPersonName) ?? PersonName(
            linkedContact?.OrgContactFirstName,
            linkedContact?.OrgContactLastName);
        var primaryContactEmail = Normalize(lead.CrmleadEmail) ??
            linkedContact?.OrgContactEmails.Select(email => Normalize(email.OrgContactEmailEmail)).FirstOrDefault(email => email is not null);
        var companyName = Normalize(lead.CrmleadCompanyName) ??
            primaryContactName ??
            "Unnamed lead";

        var ownerName = PersonName(lead.CrmleadOwnerUser?.UserFirstname, lead.CrmleadOwnerUser?.UserLastname) ??
            Normalize(lead.CrmleadOwnerUser?.UserEmail);
        var latestActivity = lead.CrmActivities
            .OrderByDescending(activity => activity.CrmactivityActivityAt)
            .FirstOrDefault();
        var lastActivityAt = Latest(lead.CrmleadLastInteractionAt, latestActivity?.CrmactivityActivityAt);
        var lastActivitySubject = latestActivity is not null &&
                                  (lead.CrmleadLastInteractionAt is null || latestActivity.CrmactivityActivityAt >= lead.CrmleadLastInteractionAt)
            ? latestActivity.CrmactivitySubject
            : null;

        var qualification = lead.CrmLeadQualifications
            .OrderByDescending(item => item.CrmleadQualQualifiedAt ?? item.CrmleadQualCreatedAt)
            .FirstOrDefault();
        var qualificationCriteriaMet = qualification is null
            ? 0
            : new[]
            {
                qualification.CrmleadQualHasAuthority,
                qualification.CrmleadQualHasBudget,
                qualification.CrmleadQualHasNeed,
                qualification.CrmleadQualHasTimeline,
            }.Count(value => value is true);

        var openOpportunities = lead.CrmOpportunities
            .Where(opportunity => opportunity.CrmopptyWonAt is null && opportunity.CrmopptyLostAt is null)
            .ToList();
        var valuedOpportunity = openOpportunities
            .Where(opportunity => opportunity.CrmopptyExpectedValueAmount is not null)
            .OrderByDescending(opportunity => opportunity.CrmopptyLastActivityAt ?? opportunity.CrmopptyCreatedAt)
            .FirstOrDefault();
        var valueAmount = lead.CrmleadEstimatedValueAmount ?? valuedOpportunity?.CrmopptyExpectedValueAmount;
        var valueCurrency = lead.CrmleadEstimatedValueAmount is not null
            ? lead.CrmleadEstimatedValueCurrencyCode
            : valuedOpportunity?.CrmopptyCurrencyCode;
        var valueContext = valuedOpportunity is not null
            ? string.Join(" · ", new[]
            {
                valuedOpportunity.CrmopptyName,
                valuedOpportunity.CrmopptyStageCodeNavigation.CrmstageName,
            }.Where(value => !string.IsNullOrWhiteSpace(value)))
            : Normalize(lead.CrmleadServiceInterest) ?? Normalize(lead.CrmleadTradeLane);

        return new LeadDto(
            lead.CrmleadId,
            companyName,
            Initials(companyName),
            primaryContactName,
            primaryContactEmail,
            Normalize(lead.CrmleadCountryCode)?.ToUpperInvariant(),
            lead.CrmleadSourceCode,
            lead.CrmleadSourceCodeNavigation.CrmleadSourceName,
            lead.CrmleadOwnerUserId,
            ownerName,
            ownerName is null ? null : Initials(ownerName),
            lead.CrmleadStatusCode,
            lead.CrmleadStatusCodeNavigation.CrmleadStatusName,
            lead.CrmleadStatusCodeNavigation.CrmleadStatusIsOpen,
            lead.CrmleadStatusCodeNavigation.CrmleadStatusIsConverted,
            lead.CrmleadStatusCodeNavigation.CrmleadStatusIsDisqualified,
            lead.CrmleadRatingCode,
            lead.CrmleadRatingCodeNavigation.CrmleadRatingName,
            qualification?.CrmleadQualQualificationScore ?? lead.CrmleadScore,
            qualificationCriteriaMet,
            lead.CrmleadAiprobabilityToConvert,
            lastActivityAt,
            lastActivitySubject,
            lead.CrmleadNextActionDueAt,
            lead.CrmleadCreatedAt,
            valueAmount,
            Normalize(valueCurrency)?.ToUpperInvariant(),
            string.IsNullOrWhiteSpace(valueContext) ? null : valueContext,
            Normalize(lead.CrmleadTradeLane),
            Normalize(lead.CrmleadServiceInterest),
            openOpportunities.Count);
    }

    private static DateTime? Latest(DateTime? first, DateTime? second)
    {
        if (first is null) return second;
        if (second is null) return first;
        return first >= second ? first : second;
    }

    private static string Initials(string name) => string.Concat(
        name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Take(2)
            .Select(part => char.ToUpperInvariant(part[0])));

    private static string? PersonName(string? firstName, string? lastName)
    {
        var name = string.Join(" ", new[] { Normalize(firstName), Normalize(lastName) }.Where(value => value is not null));
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? MetadataValue(string metadataJson, params string[] keys)
    {
        if (string.IsNullOrWhiteSpace(metadataJson)) return null;

        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (!keys.Any(key => string.Equals(key, property.Name, StringComparison.OrdinalIgnoreCase)) ||
                    property.Value.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                var value = Normalize(property.Value.GetString());
                if (value is not null) return value;
            }
        }
        catch (JsonException)
        {
            // Metadata is optional context. A malformed legacy payload must not block the lead.
        }

        return null;
    }

    private static string? JoinAddress(OrgAddress address)
    {
        var locality = string.Join(" ", new[]
        {
            Normalize(address.OrgAddTownCity),
            Normalize(address.OrgAddCountyState),
            Normalize(address.OrgAddPostZipCode),
        }.Where(value => value is not null));
        var formatted = string.Join(", ", new[]
        {
            Normalize(address.OrgNameOverride),
            Normalize(address.OrgAddLine1),
            Normalize(address.OrgAddLine2),
            Normalize(locality),
            Normalize(address.OrgAddCountry),
        }.Where(value => value is not null));

        return Normalize(formatted);
    }
}
