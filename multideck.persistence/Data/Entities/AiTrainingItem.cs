using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiTrainingItem
{
    public Guid AitiId { get; set; }

    public string AitiStatus { get; set; } = null!;

    public string? AitiTaskType { get; set; }

    public string? AitiDomainCode { get; set; }

    public string? AitiScopeType { get; set; }

    public Guid? AitiSourceConversationId { get; set; }

    public Guid? AitiSourceMessageId { get; set; }

    public Guid? AitiSourceTaskRunId { get; set; }

    public Guid? AitiSourceSuggestionId { get; set; }

    public string? AitiTitle { get; set; }

    public string AitiInputJson { get; set; } = null!;

    public string AitiIdealOutputJson { get; set; } = null!;

    public string AitiRejectedOutputJson { get; set; } = null!;

    public string? AitiInstructionText { get; set; }

    public decimal? AitiQualityScore { get; set; }

    public DateTime? AitiApprovedAt { get; set; }

    public Guid? AitiApprovedBy { get; set; }

    public DateTime AitiCreatedAt { get; set; }

    public Guid? AitiCreatedBy { get; set; }

    public virtual ICollection<AiTrainingDatasetItem> AiTrainingDatasetItems { get; set; } = new List<AiTrainingDatasetItem>();

    public virtual SysAicontextDomain? AitiDomainCodeNavigation { get; set; }

    public virtual SysAicontextScopeType? AitiScopeTypeNavigation { get; set; }

    public virtual AiConversation? AitiSourceConversation { get; set; }

    public virtual AiMessage? AitiSourceMessage { get; set; }

    public virtual AiSuggestion? AitiSourceSuggestion { get; set; }

    public virtual AiTaskRun? AitiSourceTaskRun { get; set; }

    public virtual SysAitrainingItemStatus AitiStatusNavigation { get; set; } = null!;

    public virtual SysAitaskType? AitiTaskTypeNavigation { get; set; }
}
