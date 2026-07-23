using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrminsightType
{
    public string CrminsightTypeCode { get; set; } = null!;

    public string CrminsightTypeName { get; set; } = null!;

    public string? CrminsightTypeDescription { get; set; }

    public bool CrminsightTypeIsRisk { get; set; }

    public bool CrminsightTypeIsOpportunity { get; set; }

    public bool CrminsightTypeIsActive { get; set; }

    public int CrminsightTypeSortOrder { get; set; }

    public virtual ICollection<CrmAiinsightRule> CrmAiinsightRules { get; set; } = new List<CrmAiinsightRule>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmQuoteFollowupAiinsight> CrmQuoteFollowupAiinsights { get; set; } = new List<CrmQuoteFollowupAiinsight>();
}
