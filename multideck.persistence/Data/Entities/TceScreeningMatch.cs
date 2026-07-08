using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceScreeningMatch
{
    public Guid TcematchId { get; set; }

    public Guid TcematchRunId { get; set; }

    public Guid TcematchSubjectId { get; set; }

    public Guid? TcematchEntryId { get; set; }

    public Guid? TcematchCaseId { get; set; }

    public Guid? TcematchSourceId { get; set; }

    public string TcematchListTypeCode { get; set; } = null!;

    public string TcematchStatusCode { get; set; } = null!;

    public string TcematchStrengthCode { get; set; } = null!;

    public string TcematchRiskLevelCode { get; set; } = null!;

    public decimal TcematchScore { get; set; }

    public string? TcematchMatchedName { get; set; }

    public string? TcematchMatchedField { get; set; }

    public string? TcematchMatchReason { get; set; }

    public Guid? TcematchReviewBy { get; set; }

    public DateTime? TcematchReviewedAt { get; set; }

    public string? TcematchReviewNotes { get; set; }

    public string TcematchMetadataJson { get; set; } = null!;

    public DateTime TcematchCreatedAt { get; set; }

    public Guid? TcematchCreatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual TceComplianceCase? TcematchCase { get; set; }

    public virtual CmpUser? TcematchCreatedByNavigation { get; set; }

    public virtual TceWatchlistEntry? TcematchEntry { get; set; }

    public virtual SysTcelistType TcematchListTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcematchReviewByNavigation { get; set; }

    public virtual SysTceriskLevel TcematchRiskLevelCodeNavigation { get; set; } = null!;

    public virtual TceScreeningRun TcematchRun { get; set; } = null!;

    public virtual TceDataSource? TcematchSource { get; set; }

    public virtual SysTcematchStatus TcematchStatusCodeNavigation { get; set; } = null!;

    public virtual SysTcematchStrength TcematchStrengthCodeNavigation { get; set; } = null!;

    public virtual TceScreeningSubject TcematchSubject { get; set; } = null!;
}
