using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecVerificationIssue
{
    public Guid DocseciId { get; set; }

    public Guid? DocseciVerificationTokenId { get; set; }

    public Guid? DocseciVerificationEventId { get; set; }

    public string? DocseciTargetTable { get; set; }

    public Guid? DocseciTargetId { get; set; }

    public string DocseciIssueType { get; set; } = null!;

    public string DocseciRiskLevelCode { get; set; } = null!;

    public string DocseciStatus { get; set; } = null!;

    public string DocseciTitle { get; set; } = null!;

    public string? DocseciDescription { get; set; }

    public DateTime DocseciDetectedAt { get; set; }

    public DateTime? DocseciResolvedAt { get; set; }

    public Guid? DocseciResolvedBy { get; set; }

    public string? DocseciResolutionNotes { get; set; }

    public string DocseciMetadataJson { get; set; } = null!;

    public virtual CmpUser? DocseciResolvedByNavigation { get; set; }

    public virtual SysDocumentSecurityRiskLevel DocseciRiskLevelCodeNavigation { get; set; } = null!;

    public virtual DocsecVerificationEvent? DocseciVerificationEvent { get; set; }

    public virtual DocsecVerificationToken? DocseciVerificationToken { get; set; }
}
