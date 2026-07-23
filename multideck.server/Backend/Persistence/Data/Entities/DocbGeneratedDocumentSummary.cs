using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbGeneratedDocumentSummary
{
    public Guid? DocbgdId { get; set; }

    public Guid? DocbgdRenderJobId { get; set; }

    public Guid? DocbgdTemplateId { get; set; }

    public string? TemplateCode { get; set; }

    public string? TemplateName { get; set; }

    public Guid? DocbgdTemplateVersionId { get; set; }

    public int? TemplateVersionNo { get; set; }

    public Guid? DocbgdJobDocumentId { get; set; }

    public Guid? JobId { get; set; }

    public string? JobDocumentTitle { get; set; }

    public string? DocbgdOutputFormatCode { get; set; }

    public string? OutputFormatName { get; set; }

    public string? OutputMimeType { get; set; }

    public string? DocbgdFileName { get; set; }

    public string? DocbgdStorageBucket { get; set; }

    public string? DocbgdStoragePath { get; set; }

    public string? DocbgdFileUrl { get; set; }

    public string? DocbgdMimeType { get; set; }

    public long? DocbgdFileSizeBytes { get; set; }

    public string? DocbgdSha256 { get; set; }

    public int? DocbgdVersionNo { get; set; }

    public bool? DocbgdIsCurrentVersion { get; set; }

    public DateTime? DocbgdCreatedAt { get; set; }
}
