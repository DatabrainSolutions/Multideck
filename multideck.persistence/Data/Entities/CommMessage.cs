using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessage
{
    public Guid CommMessageId { get; set; }

    public Guid CommMessageThreadId { get; set; }

    public Guid? CommMessageParentMessageId { get; set; }

    public Guid? CommMessageReplyToMessageId { get; set; }

    public Guid? CommMessageMailboxId { get; set; }

    public string CommMessageChannelCode { get; set; } = null!;

    public string CommMessageDirectionCode { get; set; } = null!;

    public string CommMessageStatusCode { get; set; } = null!;

    public string CommMessageSourceTypeCode { get; set; } = null!;

    public string CommMessageContentFormatCode { get; set; } = null!;

    public string CommMessagePriorityCode { get; set; } = null!;

    public string CommMessageSensitivityCode { get; set; } = null!;

    public string? CommMessageProviderMessageId { get; set; }

    public string? CommMessageProviderThreadId { get; set; }

    public string? CommMessageProviderConversationId { get; set; }

    public string? CommMessageInternetMessageId { get; set; }

    public string? CommMessageIdempotencyKey { get; set; }

    public string? CommMessageSubject { get; set; }

    public string? CommMessageBodyPreview { get; set; }

    public string? CommMessageBodyText { get; set; }

    public string? CommMessageBodyHtml { get; set; }

    public string CommMessageBodyJson { get; set; } = null!;

    public string? CommMessageContentHashSha256 { get; set; }

    public string CommMessageHeaderJson { get; set; } = null!;

    public string? CommMessageRawStorageBucket { get; set; }

    public string? CommMessageRawStoragePath { get; set; }

    public DateTime? CommMessageMessageDate { get; set; }

    public DateTime? CommMessageReceivedAt { get; set; }

    public DateTime? CommMessageSentAt { get; set; }

    public DateTime? CommMessageDeliveredAt { get; set; }

    public DateTime? CommMessageReadAt { get; set; }

    public bool CommMessageHasAttachments { get; set; }

    public bool CommMessageIsInbound { get; set; }

    public bool CommMessageIsInternal { get; set; }

    public bool CommMessageIsDraft { get; set; }

    public bool CommMessageIsSpam { get; set; }

    public bool CommMessageIsBodyRedacted { get; set; }

    public bool CommMessageIsTrainingAllowed { get; set; }

    public string? CommMessageAiintent { get; set; }

    public string? CommMessageAisummary { get; set; }

    public decimal? CommMessageAiconfidence { get; set; }

    public DateTime CommMessageCreatedAt { get; set; }

    public Guid? CommMessageCreatedBy { get; set; }

    public DateTime CommMessageUpdatedAt { get; set; }

    public Guid? CommMessageUpdatedBy { get; set; }

    public bool CommMessageIsDeleted { get; set; }

    public virtual ICollection<ClmClaimEvent> ClmClaimEvents { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItems { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<CommAiclassification> CommAiclassifications { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommAidraftResponse> CommAidraftResponseCommAidraftMessages { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommAidraftResponse> CommAidraftResponseCommAidraftSourceMessages { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommAipolicyRun> CommAipolicyRuns { get; set; } = new List<CommAipolicyRun>();

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();

    public virtual ICollection<CommDeliveryEvent> CommDeliveryEvents { get; set; } = new List<CommDeliveryEvent>();

    public virtual ICollection<CommExtractedEntity> CommExtractedEntities { get; set; } = new List<CommExtractedEntity>();

    public virtual ICollection<CommFederationEnvelope> CommFederationEnvelopes { get; set; } = new List<CommFederationEnvelope>();

    public virtual ICollection<CommInboundEvent> CommInboundEvents { get; set; } = new List<CommInboundEvent>();

    public virtual ICollection<CommMessageAttachment> CommMessageAttachments { get; set; } = new List<CommMessageAttachment>();

    public virtual SysCommChannel CommMessageChannelCodeNavigation { get; set; } = null!;

    public virtual SysCommContentFormat CommMessageContentFormatCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommMessageCreatedByNavigation { get; set; }

    public virtual SysCommDirection CommMessageDirectionCodeNavigation { get; set; } = null!;

    public virtual ICollection<CommMessageHeader> CommMessageHeaders { get; set; } = new List<CommMessageHeader>();

    public virtual ICollection<CommMessageLink> CommMessageLinks { get; set; } = new List<CommMessageLink>();

    public virtual CommMailbox? CommMessageMailbox { get; set; }

    public virtual CommMessage? CommMessageParentMessage { get; set; }

    public virtual SysCommPriority CommMessagePriorityCodeNavigation { get; set; } = null!;

    public virtual ICollection<CommMessageReaction> CommMessageReactions { get; set; } = new List<CommMessageReaction>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual CommMessage? CommMessageReplyToMessage { get; set; }

    public virtual SysCommSensitivityLevel CommMessageSensitivityCodeNavigation { get; set; } = null!;

    public virtual SysCommSourceType CommMessageSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysCommMessageStatus CommMessageStatusCodeNavigation { get; set; } = null!;

    public virtual CommThread CommMessageThread { get; set; } = null!;

    public virtual CmpUser? CommMessageUpdatedByNavigation { get; set; }

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommReadState> CommReadStates { get; set; } = new List<CommReadState>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmDataRequestResponse> CrmDataRequestResponses { get; set; } = new List<CrmDataRequestResponse>();

    public virtual ICollection<CrmInboundReplyMatch> CrmInboundReplyMatches { get; set; } = new List<CrmInboundReplyMatch>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();

    public virtual ICollection<CommMessage> InverseCommMessageParentMessage { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommMessage> InverseCommMessageReplyToMessage { get; set; } = new List<CommMessage>();
}
