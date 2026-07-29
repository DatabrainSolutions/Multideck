using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Deals;

public static class DevelopmentDealSeeder
{
    private const string SeedFlag = "Features:SeedDemoCrmDealsOnStartup";
    private const string SeedMarker = "multideck-development-crm-deals-v1";

    private static readonly Guid[] DemoLeadIds =
    [
        Guid.Parse("de100001-5eed-4ead-8000-000000000001"),
        Guid.Parse("de100002-5eed-4ead-8000-000000000002"),
        Guid.Parse("de100003-5eed-4ead-8000-000000000003"),
        Guid.Parse("de100004-5eed-4ead-8000-000000000004"),
        Guid.Parse("de100005-5eed-4ead-8000-000000000005"),
        Guid.Parse("de100006-5eed-4ead-8000-000000000006"),
        Guid.Parse("de100007-5eed-4ead-8000-000000000007"),
    ];

    private static readonly string[] DealNames =
    [
        "Northstar ocean programme",
        "Atelier European launch",
        "Kestrel air and ocean review",
        "Bergstrom seasonal cold chain",
        "Meridian priority air freight",
        "Fjord Living LCL consolidation",
        "Horizon robotics expansion",
    ];

    public static async Task<WebApplication> SeedDevelopmentCrmDealsAsync(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment() || !app.Configuration.GetValue<bool>(SeedFlag))
        {
            return app;
        }

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MultideckContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("MultideckDemoCrmDeals");

        var actor = await db.CmpUsers
            .AsNoTracking()
            .Where(user => user.CompanyId != null && user.AuthUserId != null)
            .OrderBy(user => user.UserEmail)
            .Select(user => new { user.UserId, CompanyId = user.CompanyId!.Value })
            .FirstOrDefaultAsync();
        if (actor is null)
        {
            logger.LogInformation("Skipped demo CRM deals because no signed-in development tenant user exists.");
            return app;
        }

        var pipelines = await db.CrmPipelines
            .Where(pipeline => pipeline.CompanyId == actor.CompanyId && !pipeline.CrmPipelineIsDeleted)
            .Include(pipeline => pipeline.CrmPipelineStages.Where(stage => !stage.CrmPipelineStageIsDeleted))
            .OrderBy(pipeline => pipeline.CrmPipelineSortOrder)
            .ToListAsync();

        if (pipelines.Count == 0)
        {
            pipelines = CreateStarterPipelines(db, actor.CompanyId, actor.UserId);
            await db.SaveChangesAsync();
        }

        var usablePipelines = pipelines
            .Where(pipeline => pipeline.CrmPipelineStages.Count > 0)
            .ToArray();
        if (usablePipelines.Length == 0)
        {
            logger.LogWarning("Skipped demo CRM deals because the development tenant has no active pipeline stages.");
            return app;
        }

        var leads = await db.CrmLeads
            .AsNoTracking()
            .Where(lead =>
                DemoLeadIds.Contains(lead.CrmleadId) &&
                lead.CrmleadOrgId != null &&
                !lead.CrmleadIsDeleted)
            .OrderBy(lead => lead.CrmleadId)
            .ToListAsync();
        if (leads.Count == 0)
        {
            logger.LogInformation("Skipped demo CRM deals because the development demo leads have not been seeded.");
            return app;
        }

        var opportunityType = await db.SysCrmopportunityTypes
            .AsNoTracking()
            .Where(item => item.CrmopptyTypeIsActive)
            .OrderBy(item => item.CrmopptyTypeSortOrder)
            .FirstOrDefaultAsync();
        var legacyStage = await db.SysCrmopportunityStages
            .AsNoTracking()
            .Where(item => item.CrmstageIsActive && item.CrmstageIsOpen)
            .OrderBy(item => item.CrmstageSortOrder)
            .FirstOrDefaultAsync();
        var status = await db.SysCrmopportunityStatuses
            .AsNoTracking()
            .Where(item => item.CrmopptyStatusIsActive && item.CrmopptyStatusIsOpen)
            .OrderBy(item => item.CrmopptyStatusSortOrder)
            .FirstOrDefaultAsync();
        var forecast = await db.SysCrmforecastCategories
            .AsNoTracking()
            .Where(item => item.CrmforecastIsActive)
            .OrderBy(item => item.CrmforecastSortOrder)
            .FirstOrDefaultAsync();
        if (opportunityType is null || legacyStage is null || status is null || forecast is null)
        {
            logger.LogWarning("Skipped demo CRM deals because the legacy CRM reference data is incomplete.");
            return app;
        }

        var existingLeadIds = await db.CrmOpportunities
            .AsNoTracking()
            .Where(deal => deal.CrmopptySourceLeadId != null && DemoLeadIds.Contains(deal.CrmopptySourceLeadId.Value))
            .Select(deal => deal.CrmopptySourceLeadId!.Value)
            .ToListAsync();
        var occupiedLeadIds = existingLeadIds.ToHashSet();
        var now = DateTime.UtcNow;
        var inserted = 0;

        for (var index = 0; index < leads.Count; index++)
        {
            var lead = leads[index];
            if (occupiedLeadIds.Contains(lead.CrmleadId)) continue;

            var pipeline = usablePipelines[index % usablePipelines.Length];
            var stages = pipeline.CrmPipelineStages
                .OrderBy(stage => stage.CrmPipelineStageSortOrder)
                .ToArray();
            var stage = stages[Math.Min(index % Math.Max(1, stages.Length), stages.Length - 1)];
            var value = lead.CrmleadEstimatedValueAmount;
            var probability = stage.CrmPipelineStageProbabilityPct;

            db.CrmOpportunities.Add(new CrmOpportunity
            {
                CrmopptyId = DemoDealId(lead.CrmleadId),
                CrmopptyOrgId = lead.CrmleadOrgId!.Value,
                CrmopptyPrimaryContactId = lead.CrmleadPrimaryContactId,
                CrmopptySourceLeadId = lead.CrmleadId,
                CrmopptyOwnerUserId = lead.CrmleadOwnerUserId ?? actor.UserId,
                CrmopptyPipelineId = pipeline.CrmPipelineId,
                CrmopptyPipelineStageId = stage.CrmPipelineStageId,
                CrmopptyName = DealNames[Array.IndexOf(DemoLeadIds, lead.CrmleadId)],
                CrmopptyTypeCode = opportunityType.CrmopptyTypeCode,
                CrmopptyStageCode = legacyStage.CrmstageCode,
                CrmopptyStatusCode = status.CrmopptyStatusCode,
                CrmopptyForecastCategoryCode = forecast.CrmforecastCode,
                CrmopptyTradeLane = lead.CrmleadTradeLane,
                CrmopptyServiceInterest = lead.CrmleadServiceInterest,
                CrmopptyExpectedCloseDate = DateOnly.FromDateTime(now.AddDays(14 + index * 7)),
                CrmopptyProbabilityPct = probability,
                CrmopptyExpectedValueAmount = value,
                CrmopptyCurrencyCode = lead.CrmleadEstimatedValueCurrencyCode ?? "GBP",
                CrmopptyWeightedValueAmount = value.HasValue
                    ? decimal.Round(value.Value * probability / 100m, 4)
                    : null,
                CrmopptyNextActionDueAt = now.AddDays(1 + index),
                CrmopptyLastActivityAt = lead.CrmleadLastInteractionAt,
                CrmopptyCustomerNeed = lead.CrmleadCustomerCentricNeed ?? "Confirm scope, service levels, and the next commercial action.",
                CrmopptyValueProposition = "A reliable Multideck operating plan matched to the customer's lane and timing.",
                CrmopptyMetadataJson = JsonSerializer.Serialize(new { seed = SeedMarker }),
                CrmopptyCreatedAt = now.AddDays(-Math.Max(1, 10 - index)),
                CrmopptyCreatedBy = actor.UserId,
                CrmopptyUpdatedAt = now,
                CrmopptyUpdatedBy = actor.UserId,
                CrmopptyIsDeleted = false,
            });
            inserted++;
        }

        if (inserted > 0)
        {
            await db.SaveChangesAsync();
            logger.LogInformation("Seeded {DealCount} database-backed CRM deals for the development tenant.", inserted);
        }

        return app;
    }

    private static List<CrmPipeline> CreateStarterPipelines(
        MultideckContext db,
        Guid companyId,
        Guid userId)
    {
        var now = DateTime.UtcNow;
        var definitions = new[]
        {
            new
            {
                Name = "Commercial pipeline",
                SortOrder = 0,
                Stages = new[]
                {
                    ("Qualifying", "blue", 0m, true, false),
                    ("Quoted", "teal", 25m, false, false),
                    ("Negotiating", "amber", 75m, false, false),
                    ("Committed", "green", 100m, false, true),
                },
            },
            new
            {
                Name = "Renewal pipeline",
                SortOrder = 1,
                Stages = new[]
                {
                    ("Review", "neutral", 0m, true, false),
                    ("Commercials", "amber", 50m, false, false),
                    ("Renewed", "green", 100m, false, true),
                },
            },
        };
        var pipelines = new List<CrmPipeline>();

        foreach (var definition in definitions)
        {
            var pipeline = new CrmPipeline
            {
                CrmPipelineId = Guid.NewGuid(),
                CompanyId = companyId,
                CrmPipelineName = definition.Name,
                CrmPipelineSortOrder = definition.SortOrder,
                CrmPipelineCreatedAt = now,
                CrmPipelineUpdatedAt = now,
                CrmPipelineCreatedByUserId = userId,
                CrmPipelineUpdatedByUserId = userId,
                CrmPipelineIsDeleted = false,
            };

            for (var index = 0; index < definition.Stages.Length; index++)
            {
                var stage = definition.Stages[index];
                pipeline.CrmPipelineStages.Add(new CrmPipelineStage
                {
                    CrmPipelineStageId = Guid.NewGuid(),
                    CompanyId = companyId,
                    CrmPipelineId = pipeline.CrmPipelineId,
                    CrmPipelineStageName = stage.Item1,
                    CrmPipelineStageTone = stage.Item2,
                    CrmPipelineStageProbabilityPct = stage.Item3,
                    CrmPipelineStageSortOrder = index,
                    CrmPipelineStageIsDefaultEntry = stage.Item4,
                    CrmPipelineStageIsConversion = stage.Item5,
                    CrmPipelineStageCreatedAt = now,
                    CrmPipelineStageUpdatedAt = now,
                    CrmPipelineStageIsDeleted = false,
                });
            }

            db.CrmPipelines.Add(pipeline);
            pipelines.Add(pipeline);
        }

        return pipelines;
    }

    private static Guid DemoDealId(Guid leadId)
    {
        var bytes = leadId.ToByteArray();
        bytes[0] = 0xDD;
        return new Guid(bytes);
    }
}
