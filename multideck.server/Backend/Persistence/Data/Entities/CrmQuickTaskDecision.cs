using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuickTaskDecision
{
    public Guid CrmquickDecisionId { get; set; }

    public Guid CrmquickDecisionQuickTaskId { get; set; }

    public Guid? CrmquickDecisionOptionId { get; set; }

    public string CrmquickDecisionDecisionStatusCode { get; set; } = null!;

    public string? CrmquickDecisionDecisionReason { get; set; }

    public string? CrmquickDecisionOriginalText { get; set; }

    public string? CrmquickDecisionEditedText { get; set; }

    public DateTime CrmquickDecisionDecidedAt { get; set; }

    public Guid? CrmquickDecisionDecidedBy { get; set; }

    public virtual CmpUser? CrmquickDecisionDecidedByNavigation { get; set; }

    public virtual SysCrmdecisionStatus CrmquickDecisionDecisionStatusCodeNavigation { get; set; } = null!;

    public virtual CrmQuickTaskOption? CrmquickDecisionOption { get; set; }

    public virtual CrmQuickTask CrmquickDecisionQuickTask { get; set; } = null!;
}
