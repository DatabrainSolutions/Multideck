using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmworkflowActionKind
{
    public string CrmawactionKindCode { get; set; } = null!;

    public string CrmawactionKindName { get; set; } = null!;

    public string? CrmawactionKindDescription { get; set; }

    public bool CrmawactionKindIsUserDecisionRequired { get; set; }

    public bool CrmawactionKindIsActive { get; set; }

    public int CrmawactionKindSortOrder { get; set; }

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();
}
