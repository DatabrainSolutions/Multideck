using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateQaissueSummary
{
    public Guid? DocbqaId { get; set; }

    public Guid? DocbqaTemplateId { get; set; }

    public string? DocbtCode { get; set; }

    public string? DocbtName { get; set; }

    public Guid? DocbqaTemplateVersionId { get; set; }

    public int? DocbtvVersionNo { get; set; }

    public string? DocbqaStatusCode { get; set; }

    public Guid? DocbqaiId { get; set; }

    public string? DocbqaiIssueTypeCode { get; set; }

    public string? IssueTypeName { get; set; }

    public string? DocbqaiSeverityCode { get; set; }

    public string? SeverityName { get; set; }

    public bool? SeverityIsBlocking { get; set; }

    public string? DocbqaiMessage { get; set; }

    public string? DocbqaiFixSuggestion { get; set; }

    public int? DocbqaiPageNo { get; set; }

    public string? DocbqaiFieldPath { get; set; }

    public bool? DocbqaiIsResolved { get; set; }

    public DateTime? DocbqaiCreatedAt { get; set; }
}
