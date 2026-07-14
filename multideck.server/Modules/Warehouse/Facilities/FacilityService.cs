using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Warehouse.Facilities;

public sealed class FacilityService(MultideckContext db, IWarehouseContext context) : IFacilityService
{
    public async Task<IReadOnlyList<FacilityDto>> ListAsync(ClaimsPrincipal user, string? search, bool includeInactive, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var query = ScopedFacilities(current.CompanyId).AsNoTracking();

        if (!includeInactive)
        {
            query = query.Where(facility => facility.WmsfacilityIsActive);
        }

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(facility =>
                EF.Functions.ILike(facility.WmsfacilityCode, pattern) ||
                EF.Functions.ILike(facility.WmsfacilityName, pattern) ||
                (facility.WmsfacilityTownCity != null && EF.Functions.ILike(facility.WmsfacilityTownCity, pattern)));
        }

        var facilities = await query
            .Include(facility => facility.WmsfacilityTypeCodeNavigation)
            .Include(facility => facility.WmsfacilityOrgOffice)
            .OrderBy(facility => facility.WmsfacilityName)
            .ToListAsync(cancellationToken);

        return facilities.Select(ToDto).ToList();
    }

    public async Task<FacilityDto> GetAsync(ClaimsPrincipal user, Guid facilityId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var facility = await LoadScopedAsync(current.CompanyId, facilityId, trackChanges: false, cancellationToken);
        return ToDto(facility);
    }

    public async Task<FacilityDto> CreateAsync(ClaimsPrincipal user, CreateFacilityRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var code = request.Code.Trim();
        await EnsureCodeIsUniqueAsync(code, excludeFacilityId: null, cancellationToken);

        var typeCode = await ResolveTypeCodeAsync(request.TypeCode, cancellationToken);
        var customsStatusCode = await ResolveCustomsStatusCodeAsync(request.DefaultCustomsStatusCode, cancellationToken);
        var office = await ResolveOfficeAsync(current.CompanyId, request.OfficeId, cancellationToken);

        var facility = new WmsFacility
        {
            WmsfacilityCode = code,
            WmsfacilityName = request.Name.Trim(),
            WmsfacilityTypeCode = typeCode,
            WmsfacilityOrgOfficeId = office.OfficeId,
            WmsfacilityUnlocode = Normalize(request.Unlocode)?.ToUpperInvariant(),
            WmsfacilityAddress1 = Normalize(request.Address1),
            WmsfacilityAddress2 = Normalize(request.Address2),
            WmsfacilityTownCity = Normalize(request.TownCity),
            WmsfacilityCountyState = Normalize(request.CountyState),
            WmsfacilityPostZipCode = Normalize(request.PostZipCode),
            WmsfacilityCountryCode = Normalize(request.CountryCode)?.ToUpperInvariant(),
            WmsfacilityTimeZone = Normalize(request.TimeZone) ?? "UTC",
            WmsfacilityIsBonded = request.IsBonded,
            WmsfacilityDefaultCustomsStatusCode = customsStatusCode,
            WmsfacilitySettingsJson = "{}",
            WmsfacilityIsActive = true,
            WmsfacilityCreatedBy = current.UserId,
            WmsfacilityUpdatedBy = current.UserId,
        };

        db.WmsFacilities.Add(facility);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user, facility.WmsfacilityId, cancellationToken);
    }

    public async Task<FacilityDto> UpdateAsync(ClaimsPrincipal user, Guid facilityId, UpdateFacilityRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var facility = await LoadScopedAsync(current.CompanyId, facilityId, trackChanges: true, cancellationToken);

        var code = request.Code.Trim();
        await EnsureCodeIsUniqueAsync(code, excludeFacilityId: facilityId, cancellationToken);

        var typeCode = await ResolveTypeCodeAsync(request.TypeCode, cancellationToken);
        var customsStatusCode = await ResolveCustomsStatusCodeAsync(request.DefaultCustomsStatusCode, cancellationToken);
        var office = await ResolveOfficeAsync(current.CompanyId, request.OfficeId, cancellationToken);

        facility.WmsfacilityCode = code;
        facility.WmsfacilityName = request.Name.Trim();
        facility.WmsfacilityTypeCode = typeCode;
        facility.WmsfacilityOrgOfficeId = office.OfficeId;
        facility.WmsfacilityUnlocode = Normalize(request.Unlocode)?.ToUpperInvariant();
        facility.WmsfacilityAddress1 = Normalize(request.Address1);
        facility.WmsfacilityAddress2 = Normalize(request.Address2);
        facility.WmsfacilityTownCity = Normalize(request.TownCity);
        facility.WmsfacilityCountyState = Normalize(request.CountyState);
        facility.WmsfacilityPostZipCode = Normalize(request.PostZipCode);
        facility.WmsfacilityCountryCode = Normalize(request.CountryCode)?.ToUpperInvariant();
        facility.WmsfacilityTimeZone = Normalize(request.TimeZone) ?? "UTC";
        facility.WmsfacilityIsBonded = request.IsBonded;
        facility.WmsfacilityDefaultCustomsStatusCode = customsStatusCode;
        facility.WmsfacilityIsActive = request.IsActive;
        facility.WmsfacilityUpdatedAt = DateTime.UtcNow;
        facility.WmsfacilityUpdatedBy = current.UserId;

        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user, facility.WmsfacilityId, cancellationToken);
    }

    public async Task DeleteAsync(ClaimsPrincipal user, Guid facilityId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var facility = await LoadScopedAsync(current.CompanyId, facilityId, trackChanges: true, cancellationToken);

        var hasItems = await db.WmsItems
            .AnyAsync(item => item.WmsitemDefaultFacilityId == facilityId && !item.WmsitemIsDeleted, cancellationToken);
        if (hasItems)
        {
            throw WarehouseException.Conflict("Move or remove the items stored in this facility before deleting it.");
        }

        var hasStock = await db.WmsInventoryBalances.AnyAsync(balance =>
            balance.WmsbalanceFacilityId == facilityId && balance.WmsbalanceOnHandQuantity != 0, cancellationToken);
        if (hasStock)
        {
            throw WarehouseException.Conflict("Dispatch or transfer the stock in this facility before deleting it.");
        }

        var hasOpenOrders = await db.WmsOrders.AnyAsync(order =>
            order.WmsorderFacilityId == facilityId && !order.WmsorderIsDeleted &&
            order.WmsorderStatusCode != "complete" && order.WmsorderStatusCode != "cancelled", cancellationToken);
        if (hasOpenOrders)
        {
            throw WarehouseException.Conflict("Complete or cancel this facility's open warehouse orders before deleting it.");
        }

        facility.WmsfacilityIsDeleted = true;
        facility.WmsfacilityIsActive = false;
        facility.WmsfacilityUpdatedAt = DateTime.UtcNow;
        facility.WmsfacilityUpdatedBy = current.UserId;

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<FacilityReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var types = await db.SysWmsfacilityTypes
            .AsNoTracking()
            .Where(type => type.WmsfacilityTypeIsActive)
            .OrderBy(type => type.WmsfacilityTypeSortOrder)
            .ThenBy(type => type.WmsfacilityTypeName)
            .Select(type => new FacilityTypeOption(type.WmsfacilityTypeCode, type.WmsfacilityTypeName, type.WmsfacilityTypeIsBondedCandidate))
            .ToListAsync(cancellationToken);

        var customsStatuses = await db.SysWmscustomsStatuses
            .AsNoTracking()
            .Where(status => status.WmscustomsStatusIsActive)
            .OrderBy(status => status.WmscustomsStatusSortOrder)
            .ThenBy(status => status.WmscustomsStatusName)
            .Select(status => new CustomsStatusOption(status.WmscustomsStatusCode, status.WmscustomsStatusName, status.WmscustomsStatusIsDutySuspended))
            .ToListAsync(cancellationToken);

        var offices = await db.CmpOffices
            .AsNoTracking()
            .Where(office => office.CompanyId == current.CompanyId)
            .OrderBy(office => office.OfficeName)
            .Select(office => new FacilityOfficeOption(office.OfficeId, office.OfficeName, office.OfficeAddress))
            .ToListAsync(cancellationToken);

        return new FacilityReferenceResponse(types, customsStatuses, offices);
    }

    private IQueryable<WmsFacility> ScopedFacilities(Guid companyId) =>
        db.WmsFacilities.Where(facility =>
            !facility.WmsfacilityIsDeleted &&
            facility.WmsfacilityOrgOffice != null &&
            facility.WmsfacilityOrgOffice.CompanyId == companyId);

    private async Task<WmsFacility> LoadScopedAsync(Guid companyId, Guid facilityId, bool trackChanges, CancellationToken cancellationToken)
    {
        var query = ScopedFacilities(companyId)
            .Include(facility => facility.WmsfacilityTypeCodeNavigation)
            .Include(facility => facility.WmsfacilityOrgOffice)
            .AsQueryable();

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var facility = await query.FirstOrDefaultAsync(item => item.WmsfacilityId == facilityId, cancellationToken);
        return facility ?? throw WarehouseException.NotFound("This facility does not exist in your workspace.");
    }

    private async Task EnsureCodeIsUniqueAsync(string code, Guid? excludeFacilityId, CancellationToken cancellationToken)
    {
        var clash = await db.WmsFacilities.AnyAsync(facility =>
            facility.WmsfacilityCode.ToLower() == code.ToLower() &&
            (excludeFacilityId == null || facility.WmsfacilityId != excludeFacilityId), cancellationToken);

        if (clash)
        {
            throw WarehouseException.Conflict($"A facility with the code '{code}' already exists.");
        }
    }

    private async Task<string> ResolveTypeCodeAsync(string typeCode, CancellationToken cancellationToken)
    {
        var code = typeCode.Trim();
        var exists = await db.SysWmsfacilityTypes.AnyAsync(type => type.WmsfacilityTypeCode == code, cancellationToken);
        if (!exists)
        {
            throw WarehouseException.BadRequest($"'{code}' is not a valid facility type.");
        }

        return code;
    }

    private async Task<string> ResolveCustomsStatusCodeAsync(string? customsStatusCode, CancellationToken cancellationToken)
    {
        var code = Normalize(customsStatusCode) ?? "free_circulation";
        var exists = await db.SysWmscustomsStatuses.AnyAsync(status => status.WmscustomsStatusCode == code, cancellationToken);
        if (!exists)
        {
            throw WarehouseException.BadRequest($"'{code}' is not a valid customs status.");
        }

        return code;
    }

    private async Task<CmpOffice> ResolveOfficeAsync(Guid companyId, Guid? officeId, CancellationToken cancellationToken)
    {
        if (officeId.HasValue)
        {
            var office = await db.CmpOffices.FirstOrDefaultAsync(item => item.OfficeId == officeId.Value, cancellationToken);
            if (office is null)
            {
                throw WarehouseException.BadRequest("Choose a valid office for this facility.");
            }

            if (office.CompanyId != companyId)
            {
                throw WarehouseException.Forbidden("Choose an office that belongs to your company.");
            }

            return office;
        }

        var defaultOffice = await db.CmpOffices
            .Where(item => item.CompanyId == companyId)
            .OrderBy(item => item.OfficeName)
            .FirstOrDefaultAsync(cancellationToken);

        return defaultOffice ?? throw WarehouseException.BadRequest("Set up a company office before creating facilities.");
    }

    private static FacilityDto ToDto(WmsFacility facility) => new(
        facility.WmsfacilityId,
        facility.WmsfacilityCode,
        facility.WmsfacilityName,
        facility.WmsfacilityTypeCode,
        facility.WmsfacilityTypeCodeNavigation?.WmsfacilityTypeName,
        facility.WmsfacilityOrgOfficeId,
        facility.WmsfacilityOrgOffice?.OfficeName,
        facility.WmsfacilityUnlocode,
        facility.WmsfacilityAddress1,
        facility.WmsfacilityAddress2,
        facility.WmsfacilityTownCity,
        facility.WmsfacilityCountyState,
        facility.WmsfacilityPostZipCode,
        facility.WmsfacilityCountryCode,
        facility.WmsfacilityTimeZone,
        facility.WmsfacilityIsBonded,
        facility.WmsfacilityDefaultCustomsStatusCode,
        facility.WmsfacilityIsActive,
        facility.WmsfacilityCreatedAt,
        facility.WmsfacilityUpdatedAt);

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
