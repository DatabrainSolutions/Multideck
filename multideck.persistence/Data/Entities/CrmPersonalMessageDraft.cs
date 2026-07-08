using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmPersonalMessageDraft
{
    public Guid CrmpmsgId { get; set; }

    public Guid? CrmpmsgRunId { get; set; }

    public Guid? CrmpmsgQuickTaskId { get; set; }

    public string CrmpmsgMessageIntentCode { get; set; } = null!;

    public string CrmpmsgChannelCode { get; set; } = null!;

    public string CrmpmsgPersonalisationModeCode { get; set; } = null!;

    public string CrmpmsgDecisionStatusCode { get; set; } = null!;

    public Guid? CrmpmsgCustomerOrgId { get; set; }

    public Guid? CrmpmsgContactId { get; set; }

    public Guid? CrmpmsgAssignedUserId { get; set; }

    public Guid? CrmpmsgCommSendId { get; set; }

    public Guid? CrmpmsgAitaskRunId { get; set; }

    public string? CrmpmsgSubject { get; set; }

    public string? CrmpmsgBodyText { get; set; }

    public string? CrmpmsgBodyHtml { get; set; }

    public string? CrmpmsgPersonalisationPrompt { get; set; }

    public string CrmpmsgPersonalisationEvidenceJson { get; set; } = null!;

    public decimal? CrmpmsgRepeatRiskScore { get; set; }

    public string? CrmpmsgBodyHashSha256 { get; set; }

    public bool CrmpmsgIsTemplateBased { get; set; }

    public bool CrmpmsgIsApprovedForSend { get; set; }

    public DateTime CrmpmsgCreatedAt { get; set; }

    public Guid? CrmpmsgCreatedBy { get; set; }

    public DateTime CrmpmsgUpdatedAt { get; set; }

    public Guid? CrmpmsgUpdatedBy { get; set; }

    public DateTime? CrmpmsgDecidedAt { get; set; }

    public Guid? CrmpmsgDecidedBy { get; set; }

    public virtual ICollection<CrmMessageVariationHistory> CrmMessageVariationHistories { get; set; } = new List<CrmMessageVariationHistory>();

    public virtual ICollection<CrmQuickTaskOption> CrmQuickTaskOptions { get; set; } = new List<CrmQuickTaskOption>();

    public virtual AiTaskRun? CrmpmsgAitaskRun { get; set; }

    public virtual CmpUser? CrmpmsgAssignedUser { get; set; }

    public virtual SysCommChannel CrmpmsgChannelCodeNavigation { get; set; } = null!;

    public virtual CommSendRequest? CrmpmsgCommSend { get; set; }

    public virtual OrgContact? CrmpmsgContact { get; set; }

    public virtual CmpUser? CrmpmsgCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmpmsgCustomerOrg { get; set; }

    public virtual CmpUser? CrmpmsgDecidedByNavigation { get; set; }

    public virtual SysCrmdecisionStatus CrmpmsgDecisionStatusCodeNavigation { get; set; } = null!;

    public virtual SysCrmmessageIntentType CrmpmsgMessageIntentCodeNavigation { get; set; } = null!;

    public virtual SysCrmpersonalisationMode CrmpmsgPersonalisationModeCodeNavigation { get; set; } = null!;

    public virtual CrmQuickTask? CrmpmsgQuickTask { get; set; }

    public virtual CrmActivityWorkflowRun? CrmpmsgRun { get; set; }

    public virtual CmpUser? CrmpmsgUpdatedByNavigation { get; set; }
}
