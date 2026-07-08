using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommSendRequest
{
    public Guid CommSendId { get; set; }

    public Guid? CommSendMessageId { get; set; }

    public Guid? CommSendThreadId { get; set; }

    public Guid? CommSendTemplateVersionId { get; set; }

    public Guid? CommSendMailboxId { get; set; }

    public string CommSendChannelCode { get; set; } = null!;

    public string CommSendStatusCode { get; set; } = null!;

    public string CommSendSourceTypeCode { get; set; } = null!;

    public string CommSendPriorityCode { get; set; } = null!;

    public string CommSendSensitivityCode { get; set; } = null!;

    public Guid? CommSendRequestedBy { get; set; }

    public Guid? CommSendApprovedBy { get; set; }

    public DateTime? CommSendApprovedAt { get; set; }

    public DateTime? CommSendScheduledAt { get; set; }

    public DateTime? CommSendNotBeforeAt { get; set; }

    public DateTime? CommSendNextRetryAt { get; set; }

    public int CommSendAttemptCount { get; set; }

    public int CommSendMaxAttempts { get; set; }

    public string? CommSendSubject { get; set; }

    public string? CommSendBodyText { get; set; }

    public string? CommSendBodyHtml { get; set; }

    public string CommSendPayloadJson { get; set; } = null!;

    public string? CommSendErrorMessage { get; set; }

    public string? CommSendCorrelationId { get; set; }

    public DateTime CommSendCreatedAt { get; set; }

    public DateTime CommSendUpdatedAt { get; set; }

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommDeliveryEvent> CommDeliveryEvents { get; set; } = new List<CommDeliveryEvent>();

    public virtual CmpUser? CommSendApprovedByNavigation { get; set; }

    public virtual SysCommChannel CommSendChannelCodeNavigation { get; set; } = null!;

    public virtual CommMailbox? CommSendMailbox { get; set; }

    public virtual CommMessage? CommSendMessage { get; set; }

    public virtual SysCommPriority CommSendPriorityCodeNavigation { get; set; } = null!;

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual CmpUser? CommSendRequestedByNavigation { get; set; }

    public virtual SysCommSensitivityLevel CommSendSensitivityCodeNavigation { get; set; } = null!;

    public virtual SysCommSourceType CommSendSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysCommMessageStatus CommSendStatusCodeNavigation { get; set; } = null!;

    public virtual CommMessageTemplateVersion? CommSendTemplateVersion { get; set; }

    public virtual CommThread? CommSendThread { get; set; }

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmMessageVariationHistory> CrmMessageVariationHistories { get; set; } = new List<CrmMessageVariationHistory>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();
}
