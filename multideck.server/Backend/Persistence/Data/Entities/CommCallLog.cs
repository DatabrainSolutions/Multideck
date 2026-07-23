using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommCallLog
{
    public Guid CommCallId { get; set; }

    public Guid? CommCallThreadId { get; set; }

    public Guid? CommCallMessageId { get; set; }

    public Guid? CommCallMailboxId { get; set; }

    public Guid? CommCallConnectionId { get; set; }

    public string CommCallDirectionCode { get; set; } = null!;

    public string CommCallStatusCode { get; set; } = null!;

    public Guid? CommCallFromIdentityId { get; set; }

    public Guid? CommCallToIdentityId { get; set; }

    public string? CommCallFromNumber { get; set; }

    public string? CommCallToNumber { get; set; }

    public string? CommCallFromDisplayNameSnapshot { get; set; }

    public string? CommCallToDisplayNameSnapshot { get; set; }

    public string? CommCallProviderCallId { get; set; }

    public DateTime? CommCallStartedAt { get; set; }

    public DateTime? CommCallAnsweredAt { get; set; }

    public DateTime? CommCallEndedAt { get; set; }

    public int? CommCallDurationSeconds { get; set; }

    public string? CommCallRecordingStorageBucket { get; set; }

    public string? CommCallRecordingStoragePath { get; set; }

    public string? CommCallTranscriptText { get; set; }

    public string? CommCallAisummary { get; set; }

    public string CommCallAiactionItemsJson { get; set; } = null!;

    public string? CommCallOutcome { get; set; }

    public string? CommCallNotes { get; set; }

    public string CommCallMetadataJson { get; set; } = null!;

    public DateTime CommCallCreatedAt { get; set; }

    public Guid? CommCallCreatedBy { get; set; }

    public virtual ICollection<CommCallActionItem> CommCallActionItems { get; set; } = new List<CommCallActionItem>();

    public virtual ICollection<CommCallAioutput> CommCallAioutputs { get; set; } = new List<CommCallAioutput>();

    public virtual CommProviderConnection? CommCallConnection { get; set; }

    public virtual CmpUser? CommCallCreatedByNavigation { get; set; }

    public virtual SysCommCallDirection CommCallDirectionCodeNavigation { get; set; } = null!;

    public virtual CommIdentity? CommCallFromIdentity { get; set; }

    public virtual CommMailbox? CommCallMailbox { get; set; }

    public virtual CommMessage? CommCallMessage { get; set; }

    public virtual SysCommCallStatus CommCallStatusCodeNavigation { get; set; } = null!;

    public virtual CommThread? CommCallThread { get; set; }

    public virtual CommIdentity? CommCallToIdentity { get; set; }

    public virtual ICollection<CommCallTranscriptSegment> CommCallTranscriptSegments { get; set; } = new List<CommCallTranscriptSegment>();

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual CrmCallReview? CrmCallReview { get; set; }

    public virtual ICollection<CrmDataRequestResponse> CrmDataRequestResponses { get; set; } = new List<CrmDataRequestResponse>();

    public virtual ICollection<CrmInboundReplyMatch> CrmInboundReplyMatches { get; set; } = new List<CrmInboundReplyMatch>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();
}
