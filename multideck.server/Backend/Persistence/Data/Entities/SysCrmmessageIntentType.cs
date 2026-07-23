using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmmessageIntentType
{
    public string CrmmsgIntentCode { get; set; } = null!;

    public string CrmmsgIntentName { get; set; } = null!;

    public string? CrmmsgIntentDescription { get; set; }

    public bool CrmmsgIntentIsCustomerFacing { get; set; }

    public bool CrmmsgIntentIsActive { get; set; }

    public int CrmmsgIntentSortOrder { get; set; }

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmMessageVariationHistory> CrmMessageVariationHistories { get; set; } = new List<CrmMessageVariationHistory>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();
}
