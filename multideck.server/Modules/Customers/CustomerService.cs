using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Customers;

public sealed class CustomerService(MultideckContext db, IWarehouseContext context) : ICustomerService
{
    public async Task<CustomerDetailDto> GetAsync(ClaimsPrincipal user, Guid customerId, CancellationToken cancellationToken)
    {
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var organisation = await db.OrgMasters
            .AsNoTracking()
            .Include(org => org.OrgAddresses).ThenInclude(address => address.OrgAddressTypes)
            .Include(org => org.OrgTypes)
            .Include(org => org.CrmAccountProfile)
            .FirstOrDefaultAsync(org => org.OrgId == customerId && (org.OrgCrmisPotentialCustomer || org.OrgTypes.Any(type => type.OrgTypeName == "Customer")), cancellationToken);
        if (organisation is null)
        {
            throw WarehouseException.NotFound("Customer not found.");
        }

        var contactEntities = await db.OrgContacts
            .AsNoTracking()
            .Where(contact => contact.OrgId == customerId)
            .Include(contact => contact.OrgContactEmails)
            .Include(contact => contact.CrmContactProfile)
            .OrderBy(contact => contact.OrgContactLastName)
            .ThenBy(contact => contact.OrgContactFirstName)
            .ToListAsync(cancellationToken);

        var contacts = contactEntities.Select(contact => new CustomerContactDto(
            contact.OrgContactId,
            string.Join(" ", new[] { contact.OrgContactFirstName, contact.OrgContactLastName }.Where(value => !string.IsNullOrWhiteSpace(value))),
            string.Concat(new[] { contact.OrgContactFirstName, contact.OrgContactLastName }.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => char.ToUpperInvariant(value![0]))),
            contact.OrgContactEmails.Select(email => email.OrgContactEmailEmail).FirstOrDefault(),
            contact.CrmContactProfile?.CrmcontactRoleCode,
            contact.CrmContactProfile?.CrmcontactPreferredChannelCode,
            contact.CrmContactProfile?.CrmcontactLastContactAt)).ToList();

        var shipmentEntities = await db.JobShipmentSummaries
            .AsNoTracking()
            .Where(job => job.JobCustomer == customerId && job.JobStatus != "Closed")
            .OrderBy(job => job.JobPredictedDeliveryAt)
            .ThenByDescending(job => job.JobCreatedDate)
            .Take(12)
            .ToListAsync(cancellationToken);

        var shipments = shipmentEntities.Select(job => new CustomerShipmentDto(
                job.JobId ?? Guid.Empty,
                $"{job.JobPeriod}-{job.JobNumber}",
                string.Join(" → ", new[] { job.JobOriginNameSnapshot, job.JobDestinationNameSnapshot }.Where(value => !string.IsNullOrWhiteSpace(value))),
                job.JobTransportModeSummary,
                job.JobTrackingStatus ?? job.JobStatus,
                job.JobPredictedDeliveryAt,
                job.JobOpenExceptionCount ?? 0))
            .ToList();

        var accountId = organisation.CrmAccountProfile?.CrmaccountId;
        var activities = accountId is null
            ? new List<CustomerActivityDto>()
            : await db.CrmActivities.AsNoTracking()
                .Where(activity => activity.CrmactivityAccountId == accountId && !activity.CrmactivityIsDeleted)
                .OrderByDescending(activity => activity.CrmactivityActivityAt)
                .Take(12)
                .Select(activity => new CustomerActivityDto(activity.CrmactivityId, activity.CrmactivitySubject, activity.CrmactivitySummary, activity.CrmactivityActivityAt, activity.CrmactivityActivityTypeCode))
                .ToListAsync(cancellationToken);

        var summary = ToDto(organisation);
        var profile = organisation.CrmAccountProfile;
        return new CustomerDetailDto(
            summary.Id, summary.Name, summary.Initials, summary.Location, summary.Industry, summary.Status,
            profile?.CrmaccountCreatedAt ?? organisation.OrgCrmupdatedAt,
            profile?.CrmaccountTier, profile?.CrmaccountSegment, profile?.CrmaccountPrimaryModeCode,
            profile?.CrmaccountPrimaryTradeLane, profile?.CrmaccountHealthScore, profile?.CrmaccountLifetimeValueAmount,
            profile?.CrmaccountLifetimeValueCurrencyCode, profile?.CrmaccountCustomerCentricSummary,
            contacts, shipments, activities);
    }

    public async Task<IReadOnlyList<CustomerDto>> ListAsync(ClaimsPrincipal user, string? search, CancellationToken cancellationToken)
    {
        // Resolve the caller before returning CRM data. Org_Master is currently shared master data;
        // tenant-specific organisation access will be applied here once that relationship exists.
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var query = db.OrgMasters
            .AsNoTracking()
            .Where(org => org.OrgCrmisPotentialCustomer || org.OrgTypes.Any(type => type.OrgTypeName == "Customer"));

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(org =>
                EF.Functions.ILike(org.OrgName, pattern) ||
                org.OrgAddresses.Any(address => address.OrgAddTownCity != null && EF.Functions.ILike(address.OrgAddTownCity, pattern)));
        }

        var organisations = await query
            .Include(org => org.OrgAddresses)
                .ThenInclude(address => address.OrgAddressTypes)
            .Include(org => org.OrgContacts)
            .Include(org => org.OrgTypes)
            .OrderBy(org => org.OrgName)
            .ToListAsync(cancellationToken);

        return organisations.Select(ToDto).ToList();
    }

    public async Task<CustomerDto> CreateAsync(ClaimsPrincipal user, CreateCustomerRequest request, CancellationToken cancellationToken)
    {
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var name = request.Name.Trim();
        var exists = await db.OrgMasters.AnyAsync(org => org.OrgName.ToLower() == name.ToLower(), cancellationToken);
        if (exists)
        {
            throw WarehouseException.Conflict($"A customer named '{name}' already exists.");
        }

        var customerType = await db.OrgTypes.FindAsync([request.OrgTypeId], cancellationToken);
        if (customerType is null)
        {
            throw WarehouseException.BadRequest("Choose a valid organisation type.");
        }

        var customer = new OrgMaster
        {
            OrgName = name,
            OrgCrmisPotentialCustomer = true,
            OrgCrmisLead = false,
            OrgCrmupdatedAt = DateTime.UtcNow,
        };
        customer.OrgTypes.Add(customerType);

        if (HasValue(request.AddressLine1) || HasValue(request.TownCity) || HasValue(request.CountryCode))
        {
            var address = new OrgAddress
            {
                OrgAddLine1 = Normalize(request.AddressLine1),
                OrgAddTownCity = Normalize(request.TownCity),
                OrgAddPostZipCode = Normalize(request.PostZipCode),
                OrgAddCountry = Normalize(request.CountryCode)?.ToUpperInvariant(),
            };
            var addressType = await db.SysAddressTypes.OrderBy(type => type.SysAddressTypeId).FirstOrDefaultAsync(cancellationToken);
            if (addressType is not null)
            {
                address.OrgAddressTypes.Add(new OrgAddressType
                {
                    OrgAddTypeType = addressType.SysAddressTypeId,
                    OrgAddTypeIsDefault = true,
                });
            }
            customer.OrgAddresses.Add(address);
        }

        if (HasValue(request.ContactFirstName) || HasValue(request.ContactLastName) || HasValue(request.ContactEmail))
        {
            var contact = new OrgContact
            {
                OrgContactFirstName = Normalize(request.ContactFirstName),
                OrgContactLastName = Normalize(request.ContactLastName),
            };
            if (HasValue(request.ContactEmail))
            {
                contact.OrgContactEmails.Add(new OrgContactEmail
                {
                    OrgContactEmailEmail = Normalize(request.ContactEmail)!,
                    OrgContactEmailType = 1,
                });
            }
            customer.OrgContacts.Add(contact);
        }

        db.OrgMasters.Add(customer);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(customer);
    }

    public async Task<CustomerReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var organisationTypes = await db.OrgTypes
            .AsNoTracking()
            .OrderBy(type => type.OrgTypeOrder)
            .ThenBy(type => type.OrgTypeName)
            .Select(type => new CustomerOrganisationTypeOption(type.OrgTypeId, type.OrgTypeName))
            .ToListAsync(cancellationToken);

        return new CustomerReferenceResponse(organisationTypes);
    }

    private static CustomerDto ToDto(OrgMaster org)
    {
        var address = org.OrgAddresses
            .OrderByDescending(item => item.OrgAddressTypes.Any(type => type.OrgAddTypeIsDefault))
            .FirstOrDefault();
        var location = string.Join(", ", new[] { address?.OrgAddTownCity, address?.OrgAddCountry }.Where(value => !string.IsNullOrWhiteSpace(value)));
        var types = org.OrgTypes.Select(type => type.OrgTypeName).OrderBy(name => name).ToList();
        var industry = types.FirstOrDefault(type => !string.Equals(type, "Customer", StringComparison.OrdinalIgnoreCase)) ?? "Customer";

        return new CustomerDto(
            org.OrgId,
            org.OrgName,
            Initials(org.OrgName),
            string.IsNullOrWhiteSpace(location) ? null : location,
            industry,
            org.OrgContacts.Count,
            org.OrgCrmisPotentialCustomer ? "Standard" : "New",
            types);
    }

    private static string Initials(string name) => string.Concat(
        name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Take(2)
            .Select(part => char.ToUpperInvariant(part[0])));

    private static bool HasValue(string? value) => !string.IsNullOrWhiteSpace(value);

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
