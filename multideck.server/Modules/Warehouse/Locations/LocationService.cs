using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Warehouse.Locations;

public sealed class LocationService(MultideckContext db, IWarehouseContext context) : ILocationService
{
    private const string DefaultStatusCode = "available";

    public async Task<IReadOnlyList<LocationDto>> ListAsync(ClaimsPrincipal user, Guid facilityId, string? search, bool includeInactive, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, facilityId, cancellationToken);

        var query = db.WmsLocations
            .AsNoTracking()
            .Where(location => location.WmslocationFacilityId == facilityId && !location.WmslocationIsDeleted);

        if (!includeInactive)
        {
            query = query.Where(location => location.WmslocationIsActive);
        }

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(location =>
                EF.Functions.ILike(location.WmslocationCode, pattern) ||
                (location.WmslocationBarcode != null && EF.Functions.ILike(location.WmslocationBarcode, pattern)) ||
                (location.WmslocationAisle != null && EF.Functions.ILike(location.WmslocationAisle, pattern)));
        }

        var locations = await query
            .Include(location => location.WmslocationTypeCodeNavigation)
            .Include(location => location.WmslocationStatusCodeNavigation)
            .Include(location => location.WmslocationZone)
                .ThenInclude(zone => zone!.WmszoneTypeCodeNavigation)
            .OrderBy(location => location.WmslocationCode)
            .ToListAsync(cancellationToken);

        return locations.Select(ToDto).ToList();
    }

    public async Task<LocationDto> GetAsync(ClaimsPrincipal user, Guid facilityId, Guid locationId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, facilityId, cancellationToken);
        var location = await LoadScopedAsync(facilityId, locationId, trackChanges: false, cancellationToken);
        return ToDto(location);
    }

    public async Task<LocationDto> CreateAsync(ClaimsPrincipal user, Guid facilityId, CreateLocationRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, facilityId, cancellationToken);

        var code = request.Code.Trim();
        await EnsureCodeIsUniqueAsync(facilityId, code, excludeLocationId: null, cancellationToken);

        var typeCode = await ResolveTypeCodeAsync(request.TypeCode, cancellationToken);
        var statusCode = await ResolveStatusCodeAsync(request.StatusCode, cancellationToken);
        var zoneId = await ResolveZoneAsync(facilityId, request.ZoneTypeCode, current.UserId, cancellationToken);

        var location = new WmsLocation
        {
            WmslocationFacilityId = facilityId,
            WmslocationZoneId = zoneId,
            WmslocationCode = code,
            WmslocationBarcode = Normalize(request.Barcode),
            WmslocationTypeCode = typeCode,
            WmslocationStatusCode = statusCode,
            WmslocationAisle = Normalize(request.Aisle),
            WmslocationBay = Normalize(request.Bay),
            WmslocationLevel = Normalize(request.Level),
            WmslocationPosition = Normalize(request.Position),
            WmslocationLengthM = request.LengthM,
            WmslocationWidthM = request.WidthM,
            WmslocationHeightM = request.HeightM,
            WmslocationMaxWeightKg = request.MaxWeightKg,
            WmslocationMaxVolumeCbm = request.MaxVolumeCbm,
            WmslocationTemperatureMinC = request.TemperatureMinC,
            WmslocationTemperatureMaxC = request.TemperatureMaxC,
            WmslocationAllowsMultiSku = request.AllowsMultiSku,
            WmslocationAllowsBondedStock = request.AllowsBondedStock,
            WmslocationAllowedCustomsStatusesJson = "[]",
            WmslocationIsActive = true,
            WmslocationCreatedBy = current.UserId,
        };

        db.WmsLocations.Add(location);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user, facilityId, location.WmslocationId, cancellationToken);
    }

    public async Task<LocationDto> UpdateAsync(ClaimsPrincipal user, Guid facilityId, Guid locationId, UpdateLocationRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, facilityId, cancellationToken);
        var location = await LoadScopedAsync(facilityId, locationId, trackChanges: true, cancellationToken);

        var code = request.Code.Trim();
        await EnsureCodeIsUniqueAsync(facilityId, code, excludeLocationId: locationId, cancellationToken);

        location.WmslocationCode = code;
        location.WmslocationBarcode = Normalize(request.Barcode);
        location.WmslocationTypeCode = await ResolveTypeCodeAsync(request.TypeCode, cancellationToken);
        location.WmslocationStatusCode = await ResolveStatusCodeAsync(request.StatusCode, cancellationToken);
        location.WmslocationZoneId = await ResolveZoneAsync(facilityId, request.ZoneTypeCode, current.UserId, cancellationToken);
        location.WmslocationAisle = Normalize(request.Aisle);
        location.WmslocationBay = Normalize(request.Bay);
        location.WmslocationLevel = Normalize(request.Level);
        location.WmslocationPosition = Normalize(request.Position);
        location.WmslocationLengthM = request.LengthM;
        location.WmslocationWidthM = request.WidthM;
        location.WmslocationHeightM = request.HeightM;
        location.WmslocationMaxWeightKg = request.MaxWeightKg;
        location.WmslocationMaxVolumeCbm = request.MaxVolumeCbm;
        location.WmslocationTemperatureMinC = request.TemperatureMinC;
        location.WmslocationTemperatureMaxC = request.TemperatureMaxC;
        location.WmslocationAllowsMultiSku = request.AllowsMultiSku;
        location.WmslocationAllowsBondedStock = request.AllowsBondedStock;
        location.WmslocationIsActive = request.IsActive;
        location.WmslocationUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user, facilityId, location.WmslocationId, cancellationToken);
    }

    public async Task DeleteAsync(ClaimsPrincipal user, Guid facilityId, Guid locationId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, facilityId, cancellationToken);
        var location = await LoadScopedAsync(facilityId, locationId, trackChanges: true, cancellationToken);

        location.WmslocationIsDeleted = true;
        location.WmslocationIsActive = false;
        location.WmslocationUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<LocationReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var types = await db.SysWmslocationTypes
            .AsNoTracking()
            .Where(type => type.WmslocationTypeIsActive)
            .OrderBy(type => type.WmslocationTypeSortOrder)
            .ThenBy(type => type.WmslocationTypeName)
            .Select(type => new LocationTypeOption(type.WmslocationTypeCode, type.WmslocationTypeName, type.WmslocationTypeIsPickable))
            .ToListAsync(cancellationToken);

        var statuses = await db.SysWmslocationStatuses
            .AsNoTracking()
            .Where(status => status.WmslocationStatusIsActive)
            .OrderBy(status => status.WmslocationStatusSortOrder)
            .ThenBy(status => status.WmslocationStatusName)
            .Select(status => new LocationStatusOption(status.WmslocationStatusCode, status.WmslocationStatusName, status.WmslocationStatusIsUsable))
            .ToListAsync(cancellationToken);

        var zones = await db.SysWmszoneTypes
            .AsNoTracking()
            .Where(zone => zone.WmszoneTypeIsActive)
            .OrderBy(zone => zone.WmszoneTypeSortOrder)
            .ThenBy(zone => zone.WmszoneTypeName)
            .Select(zone => new ZoneTypeOption(zone.WmszoneTypeCode, zone.WmszoneTypeName, zone.WmszoneTypeAllowsStock))
            .ToListAsync(cancellationToken);

        return new LocationReferenceResponse(types, statuses, zones);
    }

    private async Task<WmsLocation> LoadScopedAsync(Guid facilityId, Guid locationId, bool trackChanges, CancellationToken cancellationToken)
    {
        var query = db.WmsLocations
            .Where(location => location.WmslocationFacilityId == facilityId && !location.WmslocationIsDeleted)
            .Include(location => location.WmslocationTypeCodeNavigation)
            .Include(location => location.WmslocationStatusCodeNavigation)
            .Include(location => location.WmslocationZone)
                .ThenInclude(zone => zone!.WmszoneTypeCodeNavigation)
            .AsQueryable();

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var location = await query.FirstOrDefaultAsync(item => item.WmslocationId == locationId, cancellationToken);
        return location ?? throw WarehouseException.NotFound("This location does not exist in this facility.");
    }

    private async Task EnsureFacilityInCompanyAsync(Guid companyId, Guid facilityId, CancellationToken cancellationToken)
    {
        var facilityExists = await db.WmsFacilities.AnyAsync(facility =>
            facility.WmsfacilityId == facilityId &&
            !facility.WmsfacilityIsDeleted &&
            facility.WmsfacilityOrgOffice != null &&
            facility.WmsfacilityOrgOffice.CompanyId == companyId, cancellationToken);

        if (!facilityExists)
        {
            throw WarehouseException.NotFound("This facility does not exist in your workspace.");
        }
    }

    private async Task EnsureCodeIsUniqueAsync(Guid facilityId, string code, Guid? excludeLocationId, CancellationToken cancellationToken)
    {
        var clash = await db.WmsLocations.AnyAsync(location =>
            location.WmslocationFacilityId == facilityId &&
            location.WmslocationCode.ToLower() == code.ToLower() &&
            (excludeLocationId == null || location.WmslocationId != excludeLocationId), cancellationToken);

        if (clash)
        {
            throw WarehouseException.Conflict($"This facility already has a location with the code '{code}'.");
        }
    }

    private async Task<string> ResolveTypeCodeAsync(string typeCode, CancellationToken cancellationToken)
    {
        var code = typeCode.Trim();
        var exists = await db.SysWmslocationTypes.AnyAsync(type => type.WmslocationTypeCode == code, cancellationToken);
        if (!exists)
        {
            throw WarehouseException.BadRequest($"'{code}' is not a valid location type.");
        }

        return code;
    }

    private async Task<string> ResolveStatusCodeAsync(string? statusCode, CancellationToken cancellationToken)
    {
        var code = Normalize(statusCode) ?? DefaultStatusCode;
        var exists = await db.SysWmslocationStatuses.AnyAsync(status => status.WmslocationStatusCode == code, cancellationToken);
        if (!exists)
        {
            throw WarehouseException.BadRequest($"'{code}' is not a valid location status.");
        }

        return code;
    }

    /// <summary>
    /// Maps the chosen zone type to a concrete facility zone, creating that zone on demand.
    /// The UI selects zones from the zone type catalogue, so we keep one zone per zone type per facility.
    /// </summary>
    private async Task<Guid?> ResolveZoneAsync(Guid facilityId, string? zoneTypeCode, Guid userId, CancellationToken cancellationToken)
    {
        var code = Normalize(zoneTypeCode);
        if (code is null)
        {
            return null;
        }

        var zoneType = await db.SysWmszoneTypes.FirstOrDefaultAsync(type => type.WmszoneTypeCode == code, cancellationToken);
        if (zoneType is null)
        {
            throw WarehouseException.BadRequest($"'{code}' is not a valid zone.");
        }

        var zone = await db.WmsZones.FirstOrDefaultAsync(item =>
            item.WmszoneFacilityId == facilityId &&
            item.WmszoneTypeCode == code &&
            !item.WmszoneIsDeleted, cancellationToken);

        if (zone is null)
        {
            zone = new WmsZone
            {
                WmszoneFacilityId = facilityId,
                WmszoneCode = code.Length > 50 ? code[..50] : code,
                WmszoneName = zoneType.WmszoneTypeName,
                WmszoneTypeCode = code,
                WmszoneStatusCode = DefaultStatusCode,
                WmszoneSettingsJson = "{}",
                WmszoneIsActive = true,
                WmszoneCreatedBy = userId,
            };

            db.WmsZones.Add(zone);
            await db.SaveChangesAsync(cancellationToken);
        }

        return zone.WmszoneId;
    }

    private static LocationDto ToDto(WmsLocation location) => new(
        location.WmslocationId,
        location.WmslocationFacilityId,
        location.WmslocationCode,
        location.WmslocationBarcode,
        location.WmslocationTypeCode,
        location.WmslocationTypeCodeNavigation?.WmslocationTypeName,
        location.WmslocationStatusCode,
        location.WmslocationStatusCodeNavigation?.WmslocationStatusName,
        location.WmslocationZoneId,
        location.WmslocationZone?.WmszoneTypeCode,
        location.WmslocationZone?.WmszoneTypeCodeNavigation?.WmszoneTypeName ?? location.WmslocationZone?.WmszoneName,
        location.WmslocationAisle,
        location.WmslocationBay,
        location.WmslocationLevel,
        location.WmslocationPosition,
        location.WmslocationLengthM,
        location.WmslocationWidthM,
        location.WmslocationHeightM,
        location.WmslocationMaxWeightKg,
        location.WmslocationMaxVolumeCbm,
        location.WmslocationTemperatureMinC,
        location.WmslocationTemperatureMaxC,
        location.WmslocationAllowsMultiSku,
        location.WmslocationAllowsBondedStock,
        location.WmslocationIsActive,
        location.WmslocationCreatedAt,
        location.WmslocationUpdatedAt);

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
