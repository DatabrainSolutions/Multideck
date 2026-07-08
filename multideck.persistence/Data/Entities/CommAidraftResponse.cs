using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommAidraftResponse
{
    public Guid CommAidraftId { get; set; }

    public Guid? CommAidraftPolicyRunId { get; set; }

    public Guid? CommAidraftPolicyId { get; set; }

    public Guid CommAidraftThreadId { get; set; }

    public Guid? CommAidraftSourceMessageId { get; set; }

    public Guid? CommAidraftTemplateVersionId { get; set; }

    public string CommAidraftStatusCode { get; set; } = null!;

    public string CommAidraftChannelCode { get; set; } = null!;

    public string? CommAidraftSubject { get; set; }

    public string? CommAidraftBodyText { get; set; }

    public string? CommAidraftBodyHtml { get; set; }

    public string? CommAidraftReasoningSummary { get; set; }

    public decimal? CommAidraftConfidence { get; set; }

    public bool CommAidraftReviewRequired { get; set; }

    public bool CommAidraftAutoSendEligible { get; set; }

    public Guid? CommAidraftSendRequestId { get; set; }

    public Guid? CommAidraftMessageId { get; set; }

    public DateTime? CommAidraftReviewedAt { get; set; }

    public Guid? CommAidraftReviewedBy { get; set; }

    public string? CommAidraftReviewNotes { get; set; }

    public DateTime CommAidraftCreatedAt { get; set; }

    public DateTime? CommAidraftExpiresAt { get; set; }

    public virtual SysCommChannel CommAidraftChannelCodeNavigation { get; set; } = null!;

    public virtual CommMessage? CommAidraftMessage { get; set; }

    public virtual CommAiautomationPolicy? CommAidraftPolicy { get; set; }

    public virtual CommAipolicyRun? CommAidraftPolicyRun { get; set; }

    public virtual CmpUser? CommAidraftReviewedByNavigation { get; set; }

    public virtual CommSendRequest? CommAidraftSendRequest { get; set; }

    public virtual CommMessage? CommAidraftSourceMessage { get; set; }

    public virtual SysCommAidraftStatus CommAidraftStatusCodeNavigation { get; set; } = null!;

    public virtual CommMessageTemplateVersion? CommAidraftTemplateVersion { get; set; }

    public virtual CommThread CommAidraftThread { get; set; } = null!;
}
