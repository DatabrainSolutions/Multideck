using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadInteraction
{
    public Guid CrmleadInteractId { get; set; }

    public Guid CrmleadInteractLeadId { get; set; }

    public Guid? CrmleadInteractActivityId { get; set; }

    public Guid? CrmleadInteractCommThreadId { get; set; }

    public Guid? CrmleadInteractCommMessageId { get; set; }

    public Guid? CrmleadInteractCommCallId { get; set; }

    public string? CrmleadInteractChannelCode { get; set; }

    public DateTime CrmleadInteractInteractionAt { get; set; }

    public string? CrmleadInteractSummary { get; set; }

    public string? CrmleadInteractOutcomeCode { get; set; }

    public string? CrmleadInteractSentimentCode { get; set; }

    public DateTime? CrmleadInteractNextActionDueAt { get; set; }

    public Guid? CrmleadInteractCreatedBy { get; set; }

    public virtual CrmActivity? CrmleadInteractActivity { get; set; }

    public virtual CommCallLog? CrmleadInteractCommCall { get; set; }

    public virtual CommMessage? CrmleadInteractCommMessage { get; set; }

    public virtual CommThread? CrmleadInteractCommThread { get; set; }

    public virtual CmpUser? CrmleadInteractCreatedByNavigation { get; set; }

    public virtual CrmLead CrmleadInteractLead { get; set; } = null!;

    public virtual SysCrmactivityOutcome? CrmleadInteractOutcomeCodeNavigation { get; set; }

    public virtual SysCrmfeedbackSentiment? CrmleadInteractSentimentCodeNavigation { get; set; }
}
