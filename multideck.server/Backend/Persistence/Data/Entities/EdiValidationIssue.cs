using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiValidationIssue
{
    public Guid EdiviId { get; set; }

    public Guid? EdiviBatchId { get; set; }

    public Guid? EdiviMessageId { get; set; }

    public Guid? EdiviMappingVersionId { get; set; }

    public string EdiviSeverityCode { get; set; } = null!;

    public string EdiviIssueCode { get; set; } = null!;

    public string? EdiviFieldPath { get; set; }

    public string? EdiviSegmentRef { get; set; }

    public string EdiviDescription { get; set; } = null!;

    public string? EdiviSuggestedFix { get; set; }

    public bool EdiviIsBlocking { get; set; }

    public string EdiviStatusCode { get; set; } = null!;

    public DateTime EdiviCreatedAt { get; set; }

    public Guid? EdiviCreatedBy { get; set; }

    public DateTime? EdiviResolvedAt { get; set; }

    public Guid? EdiviResolvedBy { get; set; }

    public virtual ICollection<EdiAiinsight> EdiAiinsights { get; set; } = new List<EdiAiinsight>();

    public virtual EdiBatch? EdiviBatch { get; set; }

    public virtual CmpUser? EdiviCreatedByNavigation { get; set; }

    public virtual EdiMappingVersion? EdiviMappingVersion { get; set; }

    public virtual EdiMessage? EdiviMessage { get; set; }

    public virtual CmpUser? EdiviResolvedByNavigation { get; set; }

    public virtual SysEdivalidationSeverity EdiviSeverityCodeNavigation { get; set; } = null!;
}
