using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuickTaskOption
{
    public Guid CrmquickOptId { get; set; }

    public Guid CrmquickOptQuickTaskId { get; set; }

    public string CrmquickOptOptionTypeCode { get; set; } = null!;

    public string CrmquickOptLabel { get; set; } = null!;

    public string? CrmquickOptDescription { get; set; }

    public string? CrmquickOptChannelCode { get; set; }

    public Guid? CrmquickOptMessageDraftId { get; set; }

    public string? CrmquickOptTargetTable { get; set; }

    public Guid? CrmquickOptTargetId { get; set; }

    public string CrmquickOptDecisionStatusCode { get; set; } = null!;

    public bool CrmquickOptIsRecommended { get; set; }

    public int CrmquickOptSortOrder { get; set; }

    public string CrmquickOptActionPayloadJson { get; set; } = null!;

    public DateTime? CrmquickOptDecidedAt { get; set; }

    public Guid? CrmquickOptDecidedBy { get; set; }

    public virtual ICollection<CrmQuickTaskDecision> CrmQuickTaskDecisions { get; set; } = new List<CrmQuickTaskDecision>();

    public virtual SysCommChannel? CrmquickOptChannelCodeNavigation { get; set; }

    public virtual CmpUser? CrmquickOptDecidedByNavigation { get; set; }

    public virtual SysCrmdecisionStatus CrmquickOptDecisionStatusCodeNavigation { get; set; } = null!;

    public virtual CrmPersonalMessageDraft? CrmquickOptMessageDraft { get; set; }

    public virtual SysCrmquickTaskOptionType CrmquickOptOptionTypeCodeNavigation { get; set; } = null!;

    public virtual CrmQuickTask CrmquickOptQuickTask { get; set; } = null!;
}
