using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.CrmPipelines;

public sealed class CrmPipelineService(MultideckContext db, IWarehouseContext context) : ICrmPipelineService
{
    private static readonly string[] AllowedTones = ["green", "amber", "red", "blue", "neutral", "teal"];
    private static readonly string[] AllowedFieldTypes = ["Dropdown", "Multi-select dropdown"];
    private const int MaxStagesPerPipeline = 24;
    private const int MaxPipelinesPerCompany = 24;
    private const int MaxLeadFieldsPerCompany = 40;
    private const int MaxOptionsPerLeadField = 40;

    public async Task<CrmPipelineSettingsDto> GetSettingsAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        // Pipelines are company configuration rather than personal preference, so every internal
        // user reads the same rows for their workspace.
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        return new CrmPipelineSettingsDto(
            await ReadPipelinesAsync(currentUser.CompanyId, cancellationToken),
            await ReadLeadFieldsAsync(currentUser.CompanyId, cancellationToken));
    }

    public async Task<CrmPipelineDto> CreatePipelineAsync(ClaimsPrincipal user, SaveCrmPipelineRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);
        var stages = Validate(request);
        await RequireUnusedPipelineNameAsync(currentUser.CompanyId, null, request.Name, cancellationToken);

        var live = await db.CrmPipelines
            .Where(candidate => candidate.CompanyId == currentUser.CompanyId && !candidate.CrmPipelineIsDeleted)
            .Select(candidate => candidate.CrmPipelineSortOrder)
            .ToListAsync(cancellationToken);

        if (live.Count >= MaxPipelinesPerCompany)
        {
            throw WarehouseException.BadRequest($"A workspace can hold up to {MaxPipelinesPerCompany} pipelines.");
        }

        var now = DateTime.UtcNow;
        var pipeline = new CrmPipeline
        {
            CrmPipelineId = Guid.NewGuid(),
            CompanyId = currentUser.CompanyId,
            CrmPipelineName = request.Name.Trim(),
            CrmPipelineOwner = Normalize(request.Owner),
            CrmPipelineAutomation = Normalize(request.Automation),
            // New pipelines land after everything the workspace already has, so creating one never
            // reshuffles the order the team is used to.
            CrmPipelineSortOrder = live.Count == 0 ? 0 : live.Max() + 1,
            CrmPipelineCreatedAt = now,
            CrmPipelineUpdatedAt = now,
            CrmPipelineCreatedByUserId = currentUser.UserId,
            CrmPipelineUpdatedByUserId = currentUser.UserId,
        };

        db.CrmPipelines.Add(pipeline);

        for (var index = 0; index < stages.Count; index++)
        {
            db.CrmPipelineStages.Add(Apply(
                new CrmPipelineStage
                {
                    CrmPipelineStageId = Guid.NewGuid(),
                    CompanyId = currentUser.CompanyId,
                    CrmPipelineId = pipeline.CrmPipelineId,
                    CrmPipelineStageCreatedAt = now,
                },
                stages[index],
                index,
                now));
        }

        await db.SaveChangesAsync(cancellationToken);

        return await ReadPipelineAsync(pipeline.CrmPipelineId, cancellationToken);
    }

    public async Task<CrmPipelineDto> SavePipelineAsync(ClaimsPrincipal user, Guid pipelineId, SaveCrmPipelineRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);
        var stages = Validate(request);

        var pipeline = await db.CrmPipelines
            .Where(candidate =>
                candidate.CrmPipelineId == pipelineId &&
                candidate.CompanyId == currentUser.CompanyId &&
                !candidate.CrmPipelineIsDeleted)
            .Include(candidate => candidate.CrmPipelineStages.Where(stage => !stage.CrmPipelineStageIsDeleted))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.NotFound("That pipeline no longer exists.");

        await RequireUnusedPipelineNameAsync(currentUser.CompanyId, pipelineId, request.Name, cancellationToken);

        var now = DateTime.UtcNow;
        var existing = pipeline.CrmPipelineStages.ToDictionary(stage => stage.CrmPipelineStageId);
        var keptIds = stages.Where(stage => stage.Id.HasValue).Select(stage => stage.Id!.Value).ToHashSet();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Stage names and the default/conversion flags are uniquely indexed per pipeline, and those
        // indexes are checked per statement. Retiring removed stages, clearing the flags, and parking
        // surviving names first means a reorder that swaps two stages cannot trip a transient
        // duplicate before the final values land.
        foreach (var stage in pipeline.CrmPipelineStages)
        {
            if (!keptIds.Contains(stage.CrmPipelineStageId))
            {
                stage.CrmPipelineStageIsDeleted = true;
            }

            stage.CrmPipelineStageName = stage.CrmPipelineStageId.ToString();
            stage.CrmPipelineStageIsDefaultEntry = false;
            stage.CrmPipelineStageIsConversion = false;
            stage.CrmPipelineStageUpdatedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < stages.Count; index++)
        {
            var incoming = stages[index];
            if (incoming.Id.HasValue && existing.TryGetValue(incoming.Id.Value, out var stage))
            {
                Apply(stage, incoming, index, now);
                continue;
            }

            db.CrmPipelineStages.Add(Apply(
                new CrmPipelineStage
                {
                    CrmPipelineStageId = Guid.NewGuid(),
                    CompanyId = currentUser.CompanyId,
                    CrmPipelineId = pipeline.CrmPipelineId,
                    CrmPipelineStageCreatedAt = now,
                },
                incoming,
                index,
                now));
        }

        pipeline.CrmPipelineName = request.Name.Trim();
        pipeline.CrmPipelineOwner = Normalize(request.Owner);
        pipeline.CrmPipelineAutomation = Normalize(request.Automation);
        pipeline.CrmPipelineUpdatedAt = now;
        pipeline.CrmPipelineUpdatedByUserId = currentUser.UserId;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return await ReadPipelineAsync(pipeline.CrmPipelineId, cancellationToken);
    }

    public async Task DeletePipelineAsync(ClaimsPrincipal user, Guid pipelineId, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var pipeline = await db.CrmPipelines
            .Where(candidate =>
                candidate.CrmPipelineId == pipelineId &&
                candidate.CompanyId == currentUser.CompanyId &&
                !candidate.CrmPipelineIsDeleted)
            .Include(candidate => candidate.CrmPipelineStages.Where(stage => !stage.CrmPipelineStageIsDeleted))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.NotFound("That pipeline no longer exists.");

        var now = DateTime.UtcNow;

        // Soft delete rather than remove, so an operator who deletes the wrong pipeline has not lost
        // its stage history. The unique name index only covers live rows, so the name is freed.
        pipeline.CrmPipelineIsDeleted = true;
        pipeline.CrmPipelineUpdatedAt = now;
        pipeline.CrmPipelineUpdatedByUserId = currentUser.UserId;

        foreach (var stage in pipeline.CrmPipelineStages)
        {
            stage.CrmPipelineStageIsDeleted = true;
            stage.CrmPipelineStageUpdatedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<CrmPipelineDto>> ReorderPipelinesAsync(ClaimsPrincipal user, ReorderCrmPipelinesRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var ordered = request.PipelineIds ?? [];
        if (ordered.Distinct().Count() != ordered.Count)
        {
            throw WarehouseException.BadRequest("The pipeline order lists the same pipeline more than once.");
        }

        var pipelines = await db.CrmPipelines
            .Where(candidate => candidate.CompanyId == currentUser.CompanyId && !candidate.CrmPipelineIsDeleted)
            .ToListAsync(cancellationToken);

        // The order is company configuration, so it has to name every live pipeline. A partial list
        // would leave the pipelines it omitted sharing whatever position they held before.
        if (ordered.Count != pipelines.Count || ordered.Any(id => pipelines.All(pipeline => pipeline.CrmPipelineId != id)))
        {
            throw WarehouseException.Conflict("The pipeline list changed while you were reordering. Reload and try again.");
        }

        var now = DateTime.UtcNow;
        for (var index = 0; index < ordered.Count; index++)
        {
            var pipeline = pipelines.First(candidate => candidate.CrmPipelineId == ordered[index]);
            if (pipeline.CrmPipelineSortOrder == index) continue;

            pipeline.CrmPipelineSortOrder = index;
            pipeline.CrmPipelineUpdatedAt = now;
            pipeline.CrmPipelineUpdatedByUserId = currentUser.UserId;
        }

        await db.SaveChangesAsync(cancellationToken);

        return await ReadPipelinesAsync(currentUser.CompanyId, cancellationToken);
    }

    public async Task<CrmLeadFieldDto> CreateLeadFieldAsync(ClaimsPrincipal user, CreateCrmLeadFieldRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var label = RequireLabel(request.Label);
        var type = RequireFieldType(request.Type);
        var options = NormalizeOptions(request.Options);
        if (options.Count == 0)
        {
            throw WarehouseException.BadRequest("Give the field at least one option.");
        }

        await RequireUnusedLeadFieldLabelAsync(currentUser.CompanyId, null, label, cancellationToken);

        var live = await db.CrmLeadFieldSettings
            .Where(candidate => candidate.CompanyId == currentUser.CompanyId && !candidate.CrmLeadFieldIsDeleted)
            .Select(candidate => candidate.CrmLeadFieldSortOrder)
            .ToListAsync(cancellationToken);

        if (live.Count >= MaxLeadFieldsPerCompany)
        {
            throw WarehouseException.BadRequest($"A workspace can hold up to {MaxLeadFieldsPerCompany} lead fields.");
        }

        var active = RequireKnownOptions(request.ActiveOptions ?? [], options);
        var now = DateTime.UtcNow;

        var field = new CrmLeadFieldSetting
        {
            CrmLeadFieldId = Guid.NewGuid(),
            CompanyId = currentUser.CompanyId,
            CrmLeadFieldLabel = label,
            CrmLeadFieldTypeCode = type,
            CrmLeadFieldOptionsJson = JsonSerializer.Serialize(options),
            CrmLeadFieldActiveOptionsJson = JsonSerializer.Serialize(active),
            CrmLeadFieldSortOrder = live.Count == 0 ? 0 : live.Max() + 1,
            CrmLeadFieldCreatedAt = now,
            CrmLeadFieldUpdatedAt = now,
            CrmLeadFieldUpdatedByUserId = currentUser.UserId,
        };

        db.CrmLeadFieldSettings.Add(field);
        await db.SaveChangesAsync(cancellationToken);

        return ToDto(field);
    }

    public async Task<CrmLeadFieldDto> SaveLeadFieldAsync(ClaimsPrincipal user, Guid fieldId, SaveCrmLeadFieldRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var field = await db.CrmLeadFieldSettings
            .Where(candidate =>
                candidate.CrmLeadFieldId == fieldId &&
                candidate.CompanyId == currentUser.CompanyId &&
                !candidate.CrmLeadFieldIsDeleted)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.NotFound("That lead field no longer exists.");

        if (request.Label is not null)
        {
            var label = RequireLabel(request.Label);
            if (!string.Equals(label, field.CrmLeadFieldLabel, StringComparison.OrdinalIgnoreCase))
            {
                await RequireUnusedLeadFieldLabelAsync(currentUser.CompanyId, fieldId, label, cancellationToken);
            }
            field.CrmLeadFieldLabel = label;
        }

        if (request.Type is not null)
        {
            field.CrmLeadFieldTypeCode = RequireFieldType(request.Type);
        }

        var options = ReadOptions(field.CrmLeadFieldOptionsJson);
        if (request.Options is not null)
        {
            options = NormalizeOptions(request.Options);
            if (options.Count == 0)
            {
                throw WarehouseException.BadRequest("Give the field at least one option.");
            }
            field.CrmLeadFieldOptionsJson = JsonSerializer.Serialize(options);
        }

        // Validated against the options the field is being left with, so removing an option and
        // dropping it from the selection in the same request is accepted.
        var active = RequireKnownOptions(request.ActiveOptions ?? [], options);

        field.CrmLeadFieldActiveOptionsJson = JsonSerializer.Serialize(active);
        field.CrmLeadFieldUpdatedAt = DateTime.UtcNow;
        field.CrmLeadFieldUpdatedByUserId = currentUser.UserId;
        await db.SaveChangesAsync(cancellationToken);

        return ToDto(field);
    }

    public async Task DeleteLeadFieldAsync(ClaimsPrincipal user, Guid fieldId, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var field = await db.CrmLeadFieldSettings
            .Where(candidate =>
                candidate.CrmLeadFieldId == fieldId &&
                candidate.CompanyId == currentUser.CompanyId &&
                !candidate.CrmLeadFieldIsDeleted)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw WarehouseException.NotFound("That lead field no longer exists.");

        field.CrmLeadFieldIsDeleted = true;
        field.CrmLeadFieldUpdatedAt = DateTime.UtcNow;
        field.CrmLeadFieldUpdatedByUserId = currentUser.UserId;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<CrmLeadFieldDto>> ReorderLeadFieldsAsync(ClaimsPrincipal user, ReorderCrmLeadFieldsRequest request, CancellationToken cancellationToken)
    {
        var currentUser = await context.RequireCurrentUserAsync(user, cancellationToken);

        var ordered = request.FieldIds ?? [];
        if (ordered.Distinct().Count() != ordered.Count)
        {
            throw WarehouseException.BadRequest("The field order lists the same field more than once.");
        }

        var fields = await db.CrmLeadFieldSettings
            .Where(candidate => candidate.CompanyId == currentUser.CompanyId && !candidate.CrmLeadFieldIsDeleted)
            .ToListAsync(cancellationToken);

        if (ordered.Count != fields.Count || ordered.Any(id => fields.All(field => field.CrmLeadFieldId != id)))
        {
            throw WarehouseException.Conflict("The field list changed while you were reordering. Reload and try again.");
        }

        var now = DateTime.UtcNow;
        for (var index = 0; index < ordered.Count; index++)
        {
            var field = fields.First(candidate => candidate.CrmLeadFieldId == ordered[index]);
            if (field.CrmLeadFieldSortOrder == index) continue;

            field.CrmLeadFieldSortOrder = index;
            field.CrmLeadFieldUpdatedAt = now;
            field.CrmLeadFieldUpdatedByUserId = currentUser.UserId;
        }

        await db.SaveChangesAsync(cancellationToken);

        return await ReadLeadFieldsAsync(currentUser.CompanyId, cancellationToken);
    }

    private async Task<CrmPipelineDto> ReadPipelineAsync(Guid pipelineId, CancellationToken cancellationToken)
    {
        var saved = await db.CrmPipelines
            .AsNoTracking()
            .AsSplitQuery()
            .Where(candidate => candidate.CrmPipelineId == pipelineId)
            .Include(candidate => candidate.CrmPipelineStages.Where(stage => !stage.CrmPipelineStageIsDeleted))
            .FirstAsync(cancellationToken);

        return ToDto(saved);
    }

    private async Task<IReadOnlyList<CrmPipelineDto>> ReadPipelinesAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var pipelines = await db.CrmPipelines
            .AsNoTracking()
            .AsSplitQuery()
            .Where(pipeline => pipeline.CompanyId == companyId && !pipeline.CrmPipelineIsDeleted)
            .Include(pipeline => pipeline.CrmPipelineStages.Where(stage => !stage.CrmPipelineStageIsDeleted))
            .OrderBy(pipeline => pipeline.CrmPipelineSortOrder)
            .ThenBy(pipeline => pipeline.CrmPipelineName)
            .ToListAsync(cancellationToken);

        return pipelines.Select(ToDto).ToList();
    }

    private async Task<IReadOnlyList<CrmLeadFieldDto>> ReadLeadFieldsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var fields = await db.CrmLeadFieldSettings
            .AsNoTracking()
            .Where(field => field.CompanyId == companyId && !field.CrmLeadFieldIsDeleted)
            .OrderBy(field => field.CrmLeadFieldSortOrder)
            .ThenBy(field => field.CrmLeadFieldLabel)
            .ToListAsync(cancellationToken);

        return fields.Select(ToDto).ToList();
    }

    private async Task RequireUnusedPipelineNameAsync(Guid companyId, Guid? pipelineId, string name, CancellationToken cancellationToken)
    {
        var candidateName = name.Trim().ToLower();
        var taken = await db.CrmPipelines.AnyAsync(candidate =>
            candidate.CompanyId == companyId &&
            (pipelineId == null || candidate.CrmPipelineId != pipelineId) &&
            !candidate.CrmPipelineIsDeleted &&
            candidate.CrmPipelineName.ToLower() == candidateName, cancellationToken);

        if (taken)
        {
            throw WarehouseException.Conflict("Another pipeline already uses that name.");
        }
    }

    private async Task RequireUnusedLeadFieldLabelAsync(Guid companyId, Guid? fieldId, string label, CancellationToken cancellationToken)
    {
        var candidateLabel = label.ToLower();
        var taken = await db.CrmLeadFieldSettings.AnyAsync(candidate =>
            candidate.CompanyId == companyId &&
            (fieldId == null || candidate.CrmLeadFieldId != fieldId) &&
            !candidate.CrmLeadFieldIsDeleted &&
            candidate.CrmLeadFieldLabel.ToLower() == candidateLabel, cancellationToken);

        if (taken)
        {
            throw WarehouseException.Conflict("Another lead field already uses that name.");
        }
    }

    private static string RequireLabel(string? label) => string.IsNullOrWhiteSpace(label)
        ? throw WarehouseException.BadRequest("Give the field a name before saving.")
        : label.Trim();

    private static string RequireFieldType(string? type)
    {
        var match = AllowedFieldTypes.FirstOrDefault(allowed => string.Equals(allowed, type?.Trim(), StringComparison.OrdinalIgnoreCase));
        return match ?? throw WarehouseException.BadRequest($"\"{type}\" is not a supported field type.");
    }

    private static IReadOnlyList<string> NormalizeOptions(IReadOnlyList<string>? options)
    {
        var normalized = (options ?? [])
            .Select(option => option.Trim())
            .Where(option => option.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalized.Count > MaxOptionsPerLeadField)
        {
            throw WarehouseException.BadRequest($"A field can hold up to {MaxOptionsPerLeadField} options.");
        }

        return normalized;
    }

    /// <summary>Keeps the selection to options the field actually offers, so a stale tab cannot save a value the dropdown no longer lists.</summary>
    private static IReadOnlyList<string> RequireKnownOptions(IReadOnlyList<string> selected, IReadOnlyList<string> options)
    {
        var active = selected
            .Select(option => option.Trim())
            .Where(option => option.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var unknown = active.FirstOrDefault(option => !options.Contains(option, StringComparer.OrdinalIgnoreCase));
        if (unknown is not null)
        {
            throw WarehouseException.BadRequest($"\"{unknown}\" is not an option on this field.");
        }

        return active;
    }

    private static IReadOnlyList<SaveCrmPipelineStageRequest> Validate(SaveCrmPipelineRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw WarehouseException.BadRequest("Give the pipeline a name before saving.");
        }

        var stages = request.Stages ?? [];
        if (stages.Count == 0)
        {
            throw WarehouseException.BadRequest("A pipeline needs at least one stage.");
        }

        if (stages.Count > MaxStagesPerPipeline)
        {
            throw WarehouseException.BadRequest($"A pipeline can hold up to {MaxStagesPerPipeline} stages.");
        }

        if (stages.Any(stage => string.IsNullOrWhiteSpace(stage.Name)))
        {
            throw WarehouseException.BadRequest("Every stage needs a name.");
        }

        var duplicate = stages
            .GroupBy(stage => stage.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            throw WarehouseException.Conflict($"\"{duplicate.Key}\" is used by more than one stage.");
        }

        var invalidTone = stages.FirstOrDefault(stage => !AllowedTones.Contains(stage.Tone, StringComparer.OrdinalIgnoreCase));
        if (invalidTone is not null)
        {
            throw WarehouseException.BadRequest($"\"{invalidTone.Tone}\" is not a supported stage colour.");
        }

        if (stages.Any(stage => stage.Probability is < 0 or > 100))
        {
            throw WarehouseException.BadRequest("Win probability must be between 0 and 100.");
        }

        if (stages.Count(stage => stage.IsDefaultEntry) > 1)
        {
            throw WarehouseException.BadRequest("Only one stage can be the default entry point.");
        }

        if (stages.Count(stage => stage.IsConversion) > 1)
        {
            throw WarehouseException.BadRequest("Only one stage can be the conversion trigger.");
        }

        return stages;
    }

    private static CrmPipelineStage Apply(CrmPipelineStage stage, SaveCrmPipelineStageRequest incoming, int index, DateTime now)
    {
        stage.CrmPipelineStageName = incoming.Name.Trim();
        stage.CrmPipelineStageTone = incoming.Tone.ToLowerInvariant();
        stage.CrmPipelineStageEntryRule = Normalize(incoming.Rule);
        stage.CrmPipelineStageProbabilityPct = decimal.Round(incoming.Probability, 2);
        stage.CrmPipelineStageSortOrder = index;
        stage.CrmPipelineStageIsDefaultEntry = incoming.IsDefaultEntry;
        stage.CrmPipelineStageIsConversion = incoming.IsConversion;
        stage.CrmPipelineStageUpdatedAt = now;
        return stage;
    }

    private static CrmPipelineDto ToDto(CrmPipeline pipeline)
    {
        var stages = pipeline.CrmPipelineStages
            .OrderBy(stage => stage.CrmPipelineStageSortOrder)
            .ToList();

        // The client shows the entry point and conversion trigger by name, so resolve the flagged
        // stages here and fall back to the ends of the pipeline when neither has been chosen yet.
        var defaultStage = stages.FirstOrDefault(stage => stage.CrmPipelineStageIsDefaultEntry) ?? stages.FirstOrDefault();
        var conversionStage = stages.FirstOrDefault(stage => stage.CrmPipelineStageIsConversion) ?? stages.LastOrDefault();

        return new CrmPipelineDto(
            pipeline.CrmPipelineId,
            pipeline.CrmPipelineName,
            pipeline.CrmPipelineOwner ?? string.Empty,
            pipeline.CrmPipelineAutomation ?? string.Empty,
            pipeline.CrmPipelineSortOrder,
            defaultStage?.CrmPipelineStageName ?? string.Empty,
            conversionStage?.CrmPipelineStageName ?? string.Empty,
            stages.Select(stage => new CrmPipelineStageDto(
                stage.CrmPipelineStageId,
                stage.CrmPipelineStageName,
                stage.CrmPipelineStageTone,
                stage.CrmPipelineStageEntryRule ?? string.Empty,
                stage.CrmPipelineStageProbabilityPct,
                stage.CrmPipelineStageSortOrder,
                stage.CrmPipelineStageIsDefaultEntry,
                stage.CrmPipelineStageIsConversion)).ToList());
    }

    private static CrmLeadFieldDto ToDto(CrmLeadFieldSetting field) => new(
        field.CrmLeadFieldId,
        field.CrmLeadFieldLabel,
        field.CrmLeadFieldTypeCode,
        ReadOptions(field.CrmLeadFieldOptionsJson),
        ReadOptions(field.CrmLeadFieldActiveOptionsJson),
        field.CrmLeadFieldSortOrder);

    private static IReadOnlyList<string> ReadOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
