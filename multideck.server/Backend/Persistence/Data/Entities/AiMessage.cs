using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiMessage
{
    public Guid AimsgId { get; set; }

    public Guid AimsgConversationId { get; set; }

    public Guid? AimsgParentMessageId { get; set; }

    public string AimsgRole { get; set; } = null!;

    public Guid? AimsgUserId { get; set; }

    public Guid? AimsgModelId { get; set; }

    public Guid? AimsgTaskRunId { get; set; }

    public string? AimsgContentText { get; set; }

    public string AimsgContentJson { get; set; } = null!;

    public string? AimsgRedactedContentText { get; set; }

    public string? AimsgSourceToolName { get; set; }

    public int? AimsgPromptTokens { get; set; }

    public int? AimsgCompletionTokens { get; set; }

    public decimal? AimsgTotalCostAmount { get; set; }

    public string? AimsgTotalCostCurrencyCode { get; set; }

    public string AimsgSecurityClass { get; set; } = null!;

    public bool AimsgIsTrainingCandidate { get; set; }

    public bool AimsgIsTrainingAllowed { get; set; }

    public string? AimsgMessageHash { get; set; }

    public DateTime AimsgCreatedAt { get; set; }

    public Guid? AimsgCreatedBy { get; set; }

    public virtual ICollection<AiMessageLink> AiMessageLinks { get; set; } = new List<AiMessageLink>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();

    public virtual AiConversation AimsgConversation { get; set; } = null!;

    public virtual AiModel? AimsgModel { get; set; }

    public virtual AiMessage? AimsgParentMessage { get; set; }

    public virtual SysAimessageRole AimsgRoleNavigation { get; set; } = null!;

    public virtual AiTaskRun? AimsgTaskRun { get; set; }

    public virtual CmpUser? AimsgUser { get; set; }

    public virtual ICollection<AiMessage> InverseAimsgParentMessage { get; set; } = new List<AiMessage>();
}
