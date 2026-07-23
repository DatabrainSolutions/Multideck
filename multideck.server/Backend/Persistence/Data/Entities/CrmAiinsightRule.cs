using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAiinsightRule
{
    public Guid CrmairuleId { get; set; }

    public string CrmairuleCode { get; set; } = null!;

    public string CrmairuleName { get; set; } = null!;

    public string CrmairuleInsightTypeCode { get; set; } = null!;

    public Guid? CrmairuleOrgOfficeId { get; set; }

    public string CrmairuleTargetScope { get; set; } = null!;

    public Guid? CrmairulePromptTemplateId { get; set; }

    public string CrmairuleRuleJson { get; set; } = null!;

    public bool CrmairuleIsActive { get; set; }

    public DateTime CrmairuleCreatedAt { get; set; }

    public Guid? CrmairuleCreatedBy { get; set; }

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual CmpUser? CrmairuleCreatedByNavigation { get; set; }

    public virtual SysCrminsightType CrmairuleInsightTypeCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? CrmairuleOrgOffice { get; set; }

    public virtual AiPromptTemplate? CrmairulePromptTemplate { get; set; }
}
