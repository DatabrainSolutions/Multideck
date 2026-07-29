using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.Deals;

public sealed class DealService(MultideckContext db, IWarehouseContext context) : IDealService
{
    public async Task<IReadOnlyList<DealDto>> ListAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var deals = await DealQuery(currentUser.CompanyId)
            .OrderBy(deal => deal.CrmopptyExpectedCloseDate == null)
            .ThenBy(deal => deal.CrmopptyExpectedCloseDate)
            .ThenByDescending(deal => deal.CrmopptyCreatedAt)
            .ToListAsync(cancellationToken);

        return deals.Select(ToDto).ToList();
    }

    public async Task<DealConversionOptionsDto> GetConversionOptionsAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        await context.RequireCurrentUserAsync(user, cancellationToken);

        var types = await db.SysCrmopportunityTypes
            .AsNoTracking()
            .Where(type => type.CrmopptyTypeIsActive)
            .OrderBy(type => type.CrmopptyTypeSortOrder)
            .ThenBy(type => type.CrmopptyTypeName)
            .Select(type => new DealOptionDto(
                type.CrmopptyTypeCode,
                type.CrmopptyTypeName,
                type.CrmopptyTypeDescription))
            .ToListAsync(cancellationToken);

        return new DealConversionOptionsDto(types);
    }

    public async Task<DealDto> ConvertLeadAsync(
        ClaimsPrincipal user,
        Guid leadId,
        ConvertLeadToDealRequest request,
        CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);
        Validate(request);

        var existing = await DealQuery(currentUser.CompanyId)
            .FirstOrDefaultAsync(deal => deal.CrmopptySourceLeadId == leadId, cancellationToken);
        if (existing is not null)
        {
            return ToDto(existing) with { WasAlreadyConverted = true };
        }

        var lead = await db.CrmLeads
            .Include(item => item.CrmleadOwnerUser)
            .FirstOrDefaultAsync(item => item.CrmleadId == leadId && !item.CrmleadIsDeleted, cancellationToken)
            ?? throw WarehouseException.NotFound("Lead not found.");

        if (!lead.CrmleadOrgId.HasValue)
        {
            throw WarehouseException.BadRequest("Add a company to this lead before converting it to a deal.");
        }

        if (request.PrimaryContactId.HasValue)
        {
            var contactBelongsToCompany = await db.OrgContacts
                .AnyAsync(contact =>
                    contact.OrgContactId == request.PrimaryContactId.Value &&
                    contact.OrgId == lead.CrmleadOrgId.Value,
                    cancellationToken);
            if (!contactBelongsToCompany)
            {
                throw WarehouseException.BadRequest("Choose a contact linked to this lead's company.");
            }
        }

        var opportunityType = await db.SysCrmopportunityTypes
            .AsNoTracking()
            .FirstOrDefaultAsync(type =>
                type.CrmopptyTypeCode == request.OpportunityTypeCode &&
                type.CrmopptyTypeIsActive,
                cancellationToken)
            ?? throw WarehouseException.BadRequest("Choose an active deal type.");
        var pipeline = await db.CrmPipelines
            .AsNoTracking()
            .Where(item => item.CompanyId == currentUser.CompanyId && !item.CrmPipelineIsDeleted)
            .OrderBy(item => item.CrmPipelineSortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.BadRequest("Create a deal pipeline before converting this lead.");
        var pipelineStage = await db.CrmPipelineStages
            .AsNoTracking()
            .Where(item =>
                item.CompanyId == currentUser.CompanyId &&
                item.CrmPipelineId == pipeline.CrmPipelineId &&
                !item.CrmPipelineStageIsDeleted)
            .OrderByDescending(item => item.CrmPipelineStageIsDefaultEntry)
            .ThenBy(item => item.CrmPipelineStageSortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.BadRequest("Add an entry stage to this deal pipeline before converting this lead.");
        var stage = await db.SysCrmopportunityStages
            .AsNoTracking()
            .Where(item => item.CrmstageIsActive && item.CrmstageIsOpen)
            .OrderBy(item => item.CrmstageSortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.BadRequest("No open CRM stage is configured.");
        var status = await db.SysCrmopportunityStatuses
            .AsNoTracking()
            .Where(item => item.CrmopptyStatusIsActive && item.CrmopptyStatusIsOpen)
            .OrderBy(item => item.CrmopptyStatusSortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.BadRequest("No open CRM status is configured.");
        var forecast = await db.SysCrmforecastCategories
            .AsNoTracking()
            .Where(item => item.CrmforecastIsActive && item.CrmforecastIsIncluded)
            .OrderBy(item => item.CrmforecastSortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.BadRequest("No active forecast category is configured.");
        var convertedStatus = await db.SysCrmleadStatuses
            .AsNoTracking()
            .Where(item => item.CrmleadStatusIsActive && item.CrmleadStatusIsConverted)
            .OrderBy(item => item.CrmleadStatusSortOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.BadRequest("No converted lead status is configured.");
        var accountId = await db.CrmAccountProfiles
            .AsNoTracking()
            .Where(account => account.CrmaccountOrgId == lead.CrmleadOrgId.Value && !account.CrmaccountIsDeleted)
            .Select(account => (Guid?)account.CrmaccountId)
            .FirstOrDefaultAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var valueAmount = request.ExpectedValueAmount;
        var probability = decimal.Round(request.ProbabilityPct, 2);
        var deal = new CrmOpportunity
        {
            CrmopptyId = Guid.NewGuid(),
            CrmopptyAccountId = accountId,
            CrmopptyOrgId = lead.CrmleadOrgId.Value,
            CrmopptyPrimaryContactId = request.PrimaryContactId ?? lead.CrmleadPrimaryContactId,
            CrmopptySourceLeadId = lead.CrmleadId,
            CrmopptyOwnerUserId = lead.CrmleadOwnerUserId ?? currentUser.UserId,
            CrmopptyOrgOfficeId = lead.CrmleadOrgOfficeId,
            CrmopptyLegalEntityId = lead.CrmleadLegalEntityId,
            CrmopptyBrandId = lead.CrmleadBrandId,
            CrmopptyPipelineId = pipeline.CrmPipelineId,
            CrmopptyPipelineStageId = pipelineStage.CrmPipelineStageId,
            CrmopptyName = request.Name.Trim(),
            CrmopptyTypeCode = opportunityType.CrmopptyTypeCode,
            CrmopptyStageCode = stage.CrmstageCode,
            CrmopptyStatusCode = status.CrmopptyStatusCode,
            CrmopptyForecastCategoryCode = forecast.CrmforecastCode,
            CrmopptyModeCode = Normalize(request.ModeCode) ?? lead.CrmleadModeCode,
            CrmopptyDirectionCode = Normalize(request.DirectionCode) ?? lead.CrmleadDirectionCode,
            CrmopptyOriginNameSnapshot = Normalize(request.OriginName),
            CrmopptyDestinationNameSnapshot = Normalize(request.DestinationName),
            CrmopptyTradeLane = Normalize(request.TradeLane) ?? lead.CrmleadTradeLane,
            CrmopptyServiceInterest = Normalize(request.ServiceInterest) ?? lead.CrmleadServiceInterest,
            CrmopptyExpectedCloseDate = request.ExpectedCloseDate,
            CrmopptyProbabilityPct = probability,
            CrmopptyExpectedValueAmount = valueAmount,
            CrmopptyExpectedMarginAmount = request.ExpectedMarginAmount,
            CrmopptyCurrencyCode = Normalize(request.CurrencyCode)?.ToUpperInvariant(),
            CrmopptyWeightedValueAmount = valueAmount.HasValue
                ? decimal.Round(valueAmount.Value * probability / 100m, 4)
                : null,
            CrmopptyNextActionDueAt = request.NextActionDueAt.ToUniversalTime(),
            CrmopptyLastActivityAt = lead.CrmleadLastInteractionAt,
            CrmopptyCustomerNeed = request.CustomerNeed.Trim(),
            CrmopptyValueProposition = Normalize(request.ValueProposition),
            CrmopptyMetadataJson = JsonSerializer.Serialize(new
            {
                convertedFromLeadId = lead.CrmleadId,
                conversionSource = "lead_conversion_wizard",
            }),
            CrmopptyCreatedAt = now,
            CrmopptyCreatedBy = currentUser.UserId,
            CrmopptyUpdatedAt = now,
            CrmopptyUpdatedBy = currentUser.UserId,
            CrmopptyIsDeleted = false,
        };

        db.CrmOpportunities.Add(deal);
        db.CrmOpportunityStageHistories.Add(new CrmOpportunityStageHistory
        {
            CrmopptyStageId = Guid.NewGuid(),
            CrmopptyStageOpportunityId = deal.CrmopptyId,
            CrmopptyStageToStageCode = deal.CrmopptyStageCode,
            CrmopptyStageProbabilityPct = probability,
            CrmopptyStageReason = "Created from lead conversion",
            CrmopptyStageChangedAt = now,
            CrmopptyStageChangedBy = currentUser.UserId,
        });
        db.CrmLeadConversions.Add(new CrmLeadConversion
        {
            CrmleadConvId = Guid.NewGuid(),
            CrmleadConvLeadId = lead.CrmleadId,
            CrmleadConvOrgId = lead.CrmleadOrgId.Value,
            CrmleadConvAccountId = accountId,
            CrmleadConvOpportunityId = deal.CrmopptyId,
            CrmleadConvConvertedAt = now,
            CrmleadConvConvertedBy = currentUser.UserId,
            CrmleadConvConversionNotes = Normalize(request.ConversionNotes),
        });
        db.CrmLeadStatusHistories.Add(new CrmLeadStatusHistory
        {
            CrmleadStatusId = Guid.NewGuid(),
            CrmleadStatusLeadId = lead.CrmleadId,
            CrmleadStatusFromStatusCode = lead.CrmleadStatusCode,
            CrmleadStatusToStatusCode = convertedStatus.CrmleadStatusCode,
            CrmleadStatusReason = "Converted to deal",
            CrmleadStatusChangedAt = now,
            CrmleadStatusChangedBy = currentUser.UserId,
        });
        lead.CrmleadStatusCode = convertedStatus.CrmleadStatusCode;
        lead.CrmleadUpdatedAt = now;
        lead.CrmleadUpdatedBy = currentUser.UserId;

        await db.SaveChangesAsync(cancellationToken);

        var created = await DealQuery(currentUser.CompanyId)
            .FirstAsync(item => item.CrmopptyId == deal.CrmopptyId, cancellationToken);
        return ToDto(created);
    }

    public async Task<DealDto> MoveStageAsync(
        ClaimsPrincipal user,
        Guid dealId,
        MoveDealStageRequest request,
        CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);
        var stage = await db.CrmPipelineStages
            .AsNoTracking()
            .Include(item => item.CrmPipeline)
            .FirstOrDefaultAsync(item =>
                item.CrmPipelineStageId == request.PipelineStageId &&
                item.CrmPipelineId == request.PipelineId &&
                item.CompanyId == currentUser.CompanyId &&
                !item.CrmPipelineStageIsDeleted &&
                !item.CrmPipeline.CrmPipelineIsDeleted,
                cancellationToken)
            ?? throw WarehouseException.BadRequest("Choose a stage from an active pipeline in this workspace.");

        var deal = await db.CrmOpportunities
            .Include(item => item.CrmopptyPipeline)
            .FirstOrDefaultAsync(item =>
                item.CrmopptyId == dealId &&
                !item.CrmopptyIsDeleted &&
                item.CrmopptyPipeline != null &&
                item.CrmopptyPipeline.CompanyId == currentUser.CompanyId,
                cancellationToken)
            ?? throw WarehouseException.NotFound("Deal not found.");

        var now = DateTime.UtcNow;
        deal.CrmopptyPipelineId = stage.CrmPipelineId;
        deal.CrmopptyPipelineStageId = stage.CrmPipelineStageId;
        deal.CrmopptyProbabilityPct = stage.CrmPipelineStageProbabilityPct;
        deal.CrmopptyWeightedValueAmount = deal.CrmopptyExpectedValueAmount.HasValue
            ? decimal.Round(deal.CrmopptyExpectedValueAmount.Value * stage.CrmPipelineStageProbabilityPct / 100m, 4)
            : null;
        deal.CrmopptyUpdatedAt = now;
        deal.CrmopptyUpdatedBy = currentUser.UserId;

        db.CrmOpportunityStageHistories.Add(new CrmOpportunityStageHistory
        {
            CrmopptyStageId = Guid.NewGuid(),
            CrmopptyStageOpportunityId = deal.CrmopptyId,
            CrmopptyStageFromStageCode = deal.CrmopptyStageCode,
            CrmopptyStageToStageCode = deal.CrmopptyStageCode,
            CrmopptyStageProbabilityPct = stage.CrmPipelineStageProbabilityPct,
            CrmopptyStageReason = $"Moved to {stage.CrmPipelineStageName}",
            CrmopptyStageChangedAt = now,
            CrmopptyStageChangedBy = currentUser.UserId,
        });

        await db.SaveChangesAsync(cancellationToken);

        var updated = await DealQuery(currentUser.CompanyId)
            .FirstAsync(item => item.CrmopptyId == deal.CrmopptyId, cancellationToken);
        return ToDto(updated);
    }

    private IQueryable<CrmOpportunity> DealQuery(Guid companyId) => db.CrmOpportunities
        .AsNoTracking()
        .AsSplitQuery()
        .Where(deal =>
            !deal.CrmopptyIsDeleted &&
            deal.CrmopptyPipeline != null &&
            deal.CrmopptyPipeline.CompanyId == companyId &&
            !deal.CrmopptyPipeline.CrmPipelineIsDeleted &&
            deal.CrmopptyPipelineStage != null &&
            !deal.CrmopptyPipelineStage.CrmPipelineStageIsDeleted)
        .Include(deal => deal.CrmopptySourceLead)
        .Include(deal => deal.CrmopptyPrimaryContact)
        .Include(deal => deal.CrmopptyOwnerUser)
        .Include(deal => deal.CrmopptyPipeline)
        .Include(deal => deal.CrmopptyPipelineStage)
        .Include(deal => deal.CrmopptyTypeCodeNavigation)
        .Include(deal => deal.CrmopptyStageCodeNavigation)
        .Include(deal => deal.CrmopptyStatusCodeNavigation);

    private static DealDto ToDto(CrmOpportunity deal)
    {
        return new DealDto(
            deal.CrmopptyId,
            deal.CrmopptyOrgId,
            Normalize(deal.CrmopptySourceLead?.CrmleadCompanyName) ?? "Organisation",
            deal.CrmopptySourceLeadId ?? Guid.Empty,
            deal.CrmopptyName,
            deal.CrmopptyPipelineId!.Value,
            deal.CrmopptyPipeline!.CrmPipelineName,
            deal.CrmopptyPipelineStageId!.Value,
            deal.CrmopptyPipelineStage!.CrmPipelineStageName,
            deal.CrmopptyTypeCode,
            deal.CrmopptyTypeCodeNavigation.CrmopptyTypeName,
            deal.CrmopptyStageCode,
            deal.CrmopptyStageCodeNavigation.CrmstageName,
            deal.CrmopptyStatusCode,
            deal.CrmopptyStatusCodeNavigation.CrmopptyStatusName,
            deal.CrmopptyPrimaryContactId,
            PersonName(deal.CrmopptyPrimaryContact?.OrgContactFirstName, deal.CrmopptyPrimaryContact?.OrgContactLastName),
            deal.CrmopptyOwnerUserId,
            PersonName(deal.CrmopptyOwnerUser?.UserFirstname, deal.CrmopptyOwnerUser?.UserLastname) ??
                Normalize(deal.CrmopptyOwnerUser?.UserEmail),
            deal.CrmopptyExpectedCloseDate,
            deal.CrmopptyExpectedValueAmount,
            deal.CrmopptyExpectedMarginAmount,
            deal.CrmopptyCurrencyCode,
            deal.CrmopptyProbabilityPct,
            deal.CrmopptyModeCode,
            deal.CrmopptyDirectionCode,
            deal.CrmopptyOriginNameSnapshot,
            deal.CrmopptyDestinationNameSnapshot,
            deal.CrmopptyTradeLane,
            deal.CrmopptyServiceInterest,
            deal.CrmopptyCustomerNeed,
            deal.CrmopptyValueProposition,
            deal.CrmopptyNextActionDueAt,
            deal.CrmopptyCreatedAt);
    }

    private static void Validate(ConvertLeadToDealRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw WarehouseException.BadRequest("Give the deal a name.");
        if (request.Name.Trim().Length > 240)
            throw WarehouseException.BadRequest("Deal names must be 240 characters or fewer.");
        if (string.IsNullOrWhiteSpace(request.OpportunityTypeCode))
            throw WarehouseException.BadRequest("Choose a deal type.");
        if (request.ExpectedCloseDate < DateOnly.FromDateTime(DateTime.UtcNow))
            throw WarehouseException.BadRequest("Expected close date cannot be in the past.");
        if (request.ExpectedValueAmount < 0)
            throw WarehouseException.BadRequest("Expected value cannot be negative.");
        if (request.ExpectedMarginAmount < 0)
            throw WarehouseException.BadRequest("Expected margin cannot be negative.");
        if ((request.ExpectedValueAmount.HasValue || request.ExpectedMarginAmount.HasValue) &&
            string.IsNullOrWhiteSpace(request.CurrencyCode))
            throw WarehouseException.BadRequest("Choose a currency for the commercial values.");
        if (request.ProbabilityPct is < 0 or > 100)
            throw WarehouseException.BadRequest("Probability must be between 0 and 100.");
        if (string.IsNullOrWhiteSpace(request.CustomerNeed))
            throw WarehouseException.BadRequest("Describe what the customer needs from this deal.");
        if (request.NextActionDueAt <= DateTime.UtcNow)
            throw WarehouseException.BadRequest("Next action must be in the future.");
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? PersonName(string? firstName, string? lastName)
    {
        var value = string.Join(' ', new[] { Normalize(firstName), Normalize(lastName) }.Where(item => item is not null));
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
