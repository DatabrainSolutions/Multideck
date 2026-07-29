namespace Multideck.Server.Modules.CrmPipelines;

public sealed record CrmPipelineStageDto(
    Guid Id,
    string Name,
    string Tone,
    string Rule,
    decimal Probability,
    int SortOrder,
    bool IsDefaultEntry,
    bool IsConversion);

public sealed record CrmPipelineDto(
    Guid Id,
    string Name,
    string Owner,
    string Automation,
    int SortOrder,
    string DefaultStage,
    string ConversionStage,
    IReadOnlyList<CrmPipelineStageDto> Stages);

public sealed record CrmLeadFieldDto(
    Guid Id,
    string Label,
    string Type,
    IReadOnlyList<string> Options,
    IReadOnlyList<string> ActiveOptions,
    int SortOrder);

public sealed record CrmPipelineSettingsDto(
    IReadOnlyList<CrmPipelineDto> Pipelines,
    IReadOnlyList<CrmLeadFieldDto> Fields);

/// <summary>
/// A stage in a saved pipeline. <see cref="Id"/> is null for stages the operator added in this
/// editing session; existing stages keep their identifier so renames and reorders update in place.
/// </summary>
public sealed record SaveCrmPipelineStageRequest(
    Guid? Id,
    string Name,
    string Tone,
    string? Rule,
    decimal Probability,
    bool IsDefaultEntry,
    bool IsConversion);

/// <summary>
/// A full replacement of one pipeline. The stage list is authoritative: its order becomes the saved
/// column order, and any stage missing from it is retired.
/// </summary>
public sealed record SaveCrmPipelineRequest(
    string Name,
    string? Owner,
    string? Automation,
    IReadOnlyList<SaveCrmPipelineStageRequest> Stages);

/// <summary>
/// The company's pipeline order, most significant first. Reordering is its own request because the
/// order belongs to the workspace as a whole rather than to any single pipeline.
/// </summary>
public sealed record ReorderCrmPipelinesRequest(IReadOnlyList<Guid> PipelineIds);

/// <summary>
/// A partial update of one lead field. Every property except <see cref="ActiveOptions"/> is optional,
/// so a caller that only flips the selected options does not have to echo the field's definition back.
/// </summary>
public sealed record SaveCrmLeadFieldRequest(
    IReadOnlyList<string> ActiveOptions,
    string? Label = null,
    string? Type = null,
    IReadOnlyList<string>? Options = null);

public sealed record CreateCrmLeadFieldRequest(
    string Label,
    string Type,
    IReadOnlyList<string> Options,
    IReadOnlyList<string>? ActiveOptions = null);

public sealed record ReorderCrmLeadFieldsRequest(IReadOnlyList<Guid> FieldIds);
