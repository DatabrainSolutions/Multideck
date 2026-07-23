using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbRenderJobSummary
{
    public Guid? DocbrjId { get; set; }

    public Guid? DocbrjTemplateId { get; set; }

    public string? TemplateCode { get; set; }

    public string? TemplateName { get; set; }

    public Guid? DocbrjTemplateVersionId { get; set; }

    public int? TemplateVersionNo { get; set; }

    public string? DocbrjStatusCode { get; set; }

    public string? RenderStatusName { get; set; }

    public bool? RenderStatusIsFinal { get; set; }

    public string? DocbrjRenderEngineCode { get; set; }

    public string? RenderEngineName { get; set; }

    public string? DocbrjOutputFormatCode { get; set; }

    public string? OutputFormatName { get; set; }

    public string? OutputMimeType { get; set; }

    public string? DocbrjTargetTable { get; set; }

    public Guid? DocbrjTargetId { get; set; }

    public Guid? DocbrjJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? DocbrjJobDocumentId { get; set; }

    public string? JobDocumentTitle { get; set; }

    public string? JobDocumentFileName { get; set; }

    public DateTime? DocbrjStartedAt { get; set; }

    public DateTime? DocbrjCompletedAt { get; set; }

    public string? DocbrjErrorMessage { get; set; }

    public DateTime? DocbrjCreatedAt { get; set; }

    public Guid? LatestGeneratedDocumentId { get; set; }

    public string? LatestGeneratedFileName { get; set; }

    public string? LatestGeneratedFileUrl { get; set; }

    public string? LatestGeneratedStorageBucket { get; set; }

    public string? LatestGeneratedStoragePath { get; set; }

    public long? LatestGeneratedFileSizeBytes { get; set; }

    public int? LatestGeneratedVersionNo { get; set; }

    public int? GeneratedDocumentCount { get; set; }
}
