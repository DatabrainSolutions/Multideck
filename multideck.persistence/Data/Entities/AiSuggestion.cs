using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiSuggestion
{
    public Guid AisId { get; set; }

    public Guid? AisTaskRunId { get; set; }

    public string AisStatus { get; set; } = null!;

    public string AisTargetTable { get; set; } = null!;

    public Guid? AisTargetId { get; set; }

    public string? AisTargetFieldPath { get; set; }

    public string? AisSuggestionType { get; set; }

    public string AisOriginalValueJson { get; set; } = null!;

    public string AisSuggestedValueJson { get; set; } = null!;

    public string AisAppliedValueJson { get; set; } = null!;

    public decimal? AisConfidenceScore { get; set; }

    public string? AisReasoningSummary { get; set; }

    public bool AisIsCustomerVisible { get; set; }

    public DateTime? AisReviewedAt { get; set; }

    public Guid? AisReviewedBy { get; set; }

    public DateTime? AisAppliedAt { get; set; }

    public Guid? AisAppliedBy { get; set; }

    public string? AisReviewNotes { get; set; }

    public DateTime AisCreatedAt { get; set; }

    public virtual ICollection<AiFeedback> AiFeedbacks { get; set; } = new List<AiFeedback>();

    public virtual ICollection<AiSuggestionSource> AiSuggestionSources { get; set; } = new List<AiSuggestionSource>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();

    public virtual SysAisuggestionStatus AisStatusNavigation { get; set; } = null!;

    public virtual AiTaskRun? AisTaskRun { get; set; }
}
