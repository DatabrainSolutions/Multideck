using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Warehouse.Items;

public sealed class ItemService(MultideckContext db, IWarehouseContext context) : IItemService
{
    public async Task<IReadOnlyList<ItemDto>> ListAsync(ClaimsPrincipal user, Guid? facilityId, string? search, bool includeInactive, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var query = ScopedItems(current.CompanyId).AsNoTracking();

        if (facilityId.HasValue)
        {
            query = query.Where(item => item.WmsitemDefaultFacilityId == facilityId.Value);
        }

        if (!includeInactive)
        {
            query = query.Where(item => item.WmsitemIsActive);
        }

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(item =>
                EF.Functions.ILike(item.WmsitemSku, pattern) ||
                EF.Functions.ILike(item.WmsitemDescription, pattern));
        }

        var items = await query
            .Include(item => item.WmsitemCustomerOrg)
            .Include(item => item.WmsitemDefaultFacility)
            .OrderBy(item => item.WmsitemSku)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<ItemDto> GetAsync(ClaimsPrincipal user, Guid itemId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var item = await LoadScopedAsync(current.CompanyId, itemId, trackChanges: false, cancellationToken);
        return ToDto(item);
    }

    public async Task<ItemDto> CreateAsync(ClaimsPrincipal user, CreateItemRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var customerOrg = await ResolveCustomerOrgAsync(request.CustomerOrgId, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, request.FacilityId, cancellationToken);

        var sku = request.Sku.Trim();
        await EnsureSkuIsUniqueAsync(customerOrg.OrgId, sku, excludeItemId: null, cancellationToken);

        var item = new WmsItem
        {
            WmsitemCustomerOrgId = customerOrg.OrgId,
            WmsitemDefaultFacilityId = request.FacilityId,
            WmsitemSku = sku,
            WmsitemDescription = request.Description.Trim(),
            WmsitemCommodityDescription = Normalize(request.CommodityDescription),
            WmsitemHscode = Normalize(request.HsCode),
            WmsitemCountryOfOriginCode = Normalize(request.CountryOfOriginCode)?.ToUpperInvariant(),
            WmsitemBaseUomcode = Normalize(request.BaseUomCode)?.ToUpperInvariant() ?? "EA",
            WmsitemLengthM = request.LengthM,
            WmsitemWidthM = request.WidthM,
            WmsitemHeightM = request.HeightM,
            WmsitemNetWeightKg = request.NetWeightKg,
            WmsitemGrossWeightKg = request.GrossWeightKg,
            WmsitemIsDangerousGoods = request.IsDangerousGoods,
            WmsitemIsExciseGoods = request.IsExciseGoods,
            WmsitemIsHighValue = request.IsHighValue,
            WmsitemIsBondedEligible = request.IsBondedEligible,
            WmsitemRequiresLot = request.RequiresLot,
            WmsitemRequiresSerial = request.RequiresSerial,
            WmsitemRequiresExpiry = request.RequiresExpiry,
            WmsitemTemperatureMinC = request.TemperatureMinC,
            WmsitemTemperatureMaxC = request.TemperatureMaxC,
            WmsitemComplianceJson = "{}",
            WmsitemIsActive = true,
            WmsitemCreatedBy = current.UserId,
        };

        db.WmsItems.Add(item);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user, item.WmsitemId, cancellationToken);
    }

    public async Task<ItemDto> UpdateAsync(ClaimsPrincipal user, Guid itemId, UpdateItemRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var item = await LoadScopedAsync(current.CompanyId, itemId, trackChanges: true, cancellationToken);

        await EnsureFacilityInCompanyAsync(current.CompanyId, request.FacilityId, cancellationToken);

        var sku = request.Sku.Trim();
        await EnsureSkuIsUniqueAsync(item.WmsitemCustomerOrgId, sku, excludeItemId: itemId, cancellationToken);

        item.WmsitemDefaultFacilityId = request.FacilityId;
        item.WmsitemSku = sku;
        item.WmsitemDescription = request.Description.Trim();
        item.WmsitemCommodityDescription = Normalize(request.CommodityDescription);
        item.WmsitemHscode = Normalize(request.HsCode);
        item.WmsitemCountryOfOriginCode = Normalize(request.CountryOfOriginCode)?.ToUpperInvariant();
        item.WmsitemBaseUomcode = Normalize(request.BaseUomCode)?.ToUpperInvariant() ?? "EA";
        item.WmsitemLengthM = request.LengthM;
        item.WmsitemWidthM = request.WidthM;
        item.WmsitemHeightM = request.HeightM;
        item.WmsitemNetWeightKg = request.NetWeightKg;
        item.WmsitemGrossWeightKg = request.GrossWeightKg;
        item.WmsitemIsDangerousGoods = request.IsDangerousGoods;
        item.WmsitemIsExciseGoods = request.IsExciseGoods;
        item.WmsitemIsHighValue = request.IsHighValue;
        item.WmsitemIsBondedEligible = request.IsBondedEligible;
        item.WmsitemRequiresLot = request.RequiresLot;
        item.WmsitemRequiresSerial = request.RequiresSerial;
        item.WmsitemRequiresExpiry = request.RequiresExpiry;
        item.WmsitemTemperatureMinC = request.TemperatureMinC;
        item.WmsitemTemperatureMaxC = request.TemperatureMaxC;
        item.WmsitemIsActive = request.IsActive;
        item.WmsitemUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(user, item.WmsitemId, cancellationToken);
    }

    public async Task DeleteAsync(ClaimsPrincipal user, Guid itemId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var item = await LoadScopedAsync(current.CompanyId, itemId, trackChanges: true, cancellationToken);

        item.WmsitemIsDeleted = true;
        item.WmsitemIsActive = false;
        item.WmsitemUpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ItemReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var customers = await db.OrgMasters
            .AsNoTracking()
            .OrderBy(org => org.OrgName)
            .Select(org => new ItemCustomerOption(org.OrgId, org.OrgName))
            .ToListAsync(cancellationToken);

        var facilities = await db.WmsFacilities
            .AsNoTracking()
            .Where(facility =>
                !facility.WmsfacilityIsDeleted &&
                facility.WmsfacilityIsActive &&
                facility.WmsfacilityOrgOffice != null &&
                facility.WmsfacilityOrgOffice.CompanyId == current.CompanyId)
            .OrderBy(facility => facility.WmsfacilityName)
            .Select(facility => new ItemFacilityOption(facility.WmsfacilityId, facility.WmsfacilityCode, facility.WmsfacilityName))
            .ToListAsync(cancellationToken);

        return new ItemReferenceResponse(customers, facilities);
    }

    public async Task<ImportItemsResponse> ImportAsync(ClaimsPrincipal user, Guid customerOrgId, Guid facilityId, IReadOnlyList<ImportItemRow> rows, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var customerOrg = await ResolveCustomerOrgAsync(customerOrgId, cancellationToken);
        await EnsureFacilityInCompanyAsync(current.CompanyId, facilityId, cancellationToken);

        if (rows.Count == 0)
        {
            throw WarehouseException.BadRequest("The spreadsheet did not contain any item rows.");
        }

        var existingSkus = (await db.WmsItems
                .Where(item => item.WmsitemCustomerOrgId == customerOrg.OrgId && !item.WmsitemIsDeleted)
                .Select(item => item.WmsitemSku)
                .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var batchSkus = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<ImportItemResult>();
        var createdCount = 0;

        foreach (var line in rows)
        {
            var sourceRow = line.SourceRow;
            var sku = line.Sku?.Trim();
            var description = line.Description?.Trim();

            if (string.IsNullOrWhiteSpace(sku))
            {
                results.Add(new ImportItemResult(sourceRow, sku, false, "SKU is required."));
                continue;
            }

            if (sku.Length > 120)
            {
                results.Add(new ImportItemResult(sourceRow, sku, false, "SKU must be 120 characters or fewer."));
                continue;
            }

            if (string.IsNullOrWhiteSpace(description))
            {
                results.Add(new ImportItemResult(sourceRow, sku, false, "Description is required."));
                continue;
            }

            if (existingSkus.Contains(sku) || !batchSkus.Add(sku))
            {
                results.Add(new ImportItemResult(sourceRow, sku, false, $"SKU '{sku}' already exists for this customer."));
                continue;
            }

            if (line.NetWeightKg.HasValue && line.GrossWeightKg.HasValue && line.GrossWeightKg < line.NetWeightKg)
            {
                results.Add(new ImportItemResult(sourceRow, sku, false, "Gross weight cannot be less than net weight."));
                continue;
            }

            if (line.TemperatureMinC.HasValue && line.TemperatureMaxC.HasValue && line.TemperatureMaxC < line.TemperatureMinC)
            {
                results.Add(new ImportItemResult(sourceRow, sku, false, "Maximum temperature cannot be below the minimum temperature."));
                continue;
            }

            var item = new WmsItem
            {
                WmsitemCustomerOrgId = customerOrg.OrgId,
                WmsitemDefaultFacilityId = facilityId,
                WmsitemSku = sku,
                WmsitemDescription = description,
                WmsitemCommodityDescription = Normalize(line.CommodityDescription),
                WmsitemHscode = Normalize(line.HsCode),
                WmsitemCountryOfOriginCode = Normalize(line.CountryOfOriginCode)?.ToUpperInvariant(),
                WmsitemBaseUomcode = Normalize(line.BaseUomCode)?.ToUpperInvariant() ?? "EA",
                WmsitemLengthM = line.LengthM,
                WmsitemWidthM = line.WidthM,
                WmsitemHeightM = line.HeightM,
                WmsitemNetWeightKg = line.NetWeightKg,
                WmsitemGrossWeightKg = line.GrossWeightKg,
                WmsitemIsDangerousGoods = line.IsDangerousGoods,
                WmsitemIsExciseGoods = line.IsExciseGoods,
                WmsitemIsHighValue = line.IsHighValue,
                WmsitemIsBondedEligible = line.IsBondedEligible,
                WmsitemRequiresLot = line.RequiresLot,
                WmsitemRequiresSerial = line.RequiresSerial,
                WmsitemRequiresExpiry = line.RequiresExpiry,
                WmsitemTemperatureMinC = line.TemperatureMinC,
                WmsitemTemperatureMaxC = line.TemperatureMaxC,
                WmsitemComplianceJson = "{}",
                WmsitemIsActive = true,
                WmsitemCreatedBy = current.UserId,
            };

            db.WmsItems.Add(item);
            results.Add(new ImportItemResult(sourceRow, sku, true, null));
            createdCount++;
        }

        if (createdCount > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return new ImportItemsResponse(createdCount, results.Count - createdCount, results);
    }

    private IQueryable<WmsItem> ScopedItems(Guid companyId) =>
        db.WmsItems.Where(item =>
            !item.WmsitemIsDeleted &&
            item.WmsitemDefaultFacility != null &&
            item.WmsitemDefaultFacility.WmsfacilityOrgOffice != null &&
            item.WmsitemDefaultFacility.WmsfacilityOrgOffice.CompanyId == companyId);

    private async Task<WmsItem> LoadScopedAsync(Guid companyId, Guid itemId, bool trackChanges, CancellationToken cancellationToken)
    {
        var query = ScopedItems(companyId)
            .Include(item => item.WmsitemCustomerOrg)
            .Include(item => item.WmsitemDefaultFacility)
            .AsQueryable();

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var item = await query.FirstOrDefaultAsync(entity => entity.WmsitemId == itemId, cancellationToken);
        return item ?? throw WarehouseException.NotFound("This item does not exist in your workspace.");
    }

    private async Task<OrgMaster> ResolveCustomerOrgAsync(Guid customerOrgId, CancellationToken cancellationToken)
    {
        var org = await db.OrgMasters.FirstOrDefaultAsync(item => item.OrgId == customerOrgId, cancellationToken);
        return org ?? throw WarehouseException.BadRequest("Choose a valid customer for this item.");
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
            throw WarehouseException.BadRequest("Choose a facility that belongs to your workspace.");
        }
    }

    private async Task EnsureSkuIsUniqueAsync(Guid customerOrgId, string sku, Guid? excludeItemId, CancellationToken cancellationToken)
    {
        var clash = await db.WmsItems.AnyAsync(item =>
            item.WmsitemCustomerOrgId == customerOrgId &&
            item.WmsitemSku.ToLower() == sku.ToLower() &&
            (excludeItemId == null || item.WmsitemId != excludeItemId), cancellationToken);

        if (clash)
        {
            throw WarehouseException.Conflict($"This customer already has an item with the SKU '{sku}'.");
        }
    }

    private static ItemDto ToDto(WmsItem item) => new(
        item.WmsitemId,
        item.WmsitemCustomerOrgId,
        item.WmsitemCustomerOrg?.OrgName,
        item.WmsitemDefaultFacilityId,
        item.WmsitemDefaultFacility?.WmsfacilityName,
        item.WmsitemSku,
        item.WmsitemDescription,
        item.WmsitemCommodityDescription,
        item.WmsitemHscode,
        item.WmsitemCountryOfOriginCode,
        item.WmsitemBaseUomcode,
        item.WmsitemLengthM,
        item.WmsitemWidthM,
        item.WmsitemHeightM,
        item.WmsitemNetWeightKg,
        item.WmsitemGrossWeightKg,
        item.WmsitemIsDangerousGoods,
        item.WmsitemIsExciseGoods,
        item.WmsitemIsHighValue,
        item.WmsitemIsBondedEligible,
        item.WmsitemRequiresLot,
        item.WmsitemRequiresSerial,
        item.WmsitemRequiresExpiry,
        item.WmsitemTemperatureMinC,
        item.WmsitemTemperatureMaxC,
        item.WmsitemIsActive,
        item.WmsitemCreatedAt,
        item.WmsitemUpdatedAt);

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
