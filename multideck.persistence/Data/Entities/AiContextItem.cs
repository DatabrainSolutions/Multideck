using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiContextItem
{
    public Guid AiciId { get; set; }

    public Guid AiciContextStoreId { get; set; }

    public string AiciStatus { get; set; } = null!;

    public string? AiciTitle { get; set; }

    public string? AiciDomainCode { get; set; }

    public string? AiciContentText { get; set; }

    public string AiciContentJson { get; set; } = null!;

    public string? AiciSourceTable { get; set; }

    public Guid? AiciSourceId { get; set; }

    public string? AiciSourceFieldPath { get; set; }

    public decimal? AiciConfidenceScore { get; set; }

    public bool AiciIsPolicy { get; set; }

    public DateOnly? AiciEffectiveFrom { get; set; }

    public DateOnly? AiciEffectiveTo { get; set; }

    public DateTime? AiciApprovedAt { get; set; }

    public Guid? AiciApprovedBy { get; set; }

    public DateTime? AiciRejectedAt { get; set; }

    public Guid? AiciRejectedBy { get; set; }

    public string? AiciReviewNotes { get; set; }

    public DateTime AiciCreatedAt { get; set; }

    public Guid? AiciCreatedBy { get; set; }

    public DateTime AiciUpdatedAt { get; set; }

    public Guid? AiciUpdatedBy { get; set; }

    public virtual ICollection<AiContextChunk> AiContextChunks { get; set; } = new List<AiContextChunk>();

    public virtual AiContextStore AiciContextStore { get; set; } = null!;

    public virtual SysAicontextDomain? AiciDomainCodeNavigation { get; set; }

    public virtual SysAicontextItemStatus AiciStatusNavigation { get; set; } = null!;
}
