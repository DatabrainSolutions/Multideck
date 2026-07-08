using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmnextBestActionType
{
    public string CrmnbatypeCode { get; set; } = null!;

    public string CrmnbatypeName { get; set; } = null!;

    public string? CrmnbatypeDescription { get; set; }

    public string? CrmnbatypeDefaultWorkflowTaskTypeCode { get; set; }

    public bool CrmnbatypeIsCustomerVisible { get; set; }

    public bool CrmnbatypeIsActive { get; set; }

    public int CrmnbatypeSortOrder { get; set; }

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreas { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmChurnRiskScore> CrmChurnRiskScores { get; set; } = new List<CrmChurnRiskScore>();

    public virtual ICollection<CrmLeadKpisnapshot> CrmLeadKpisnapshots { get; set; } = new List<CrmLeadKpisnapshot>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmQuoteFollowupAiinsight> CrmQuoteFollowupAiinsights { get; set; } = new List<CrmQuoteFollowupAiinsight>();

    public virtual ICollection<CrmQuoteFollowupSchedule> CrmQuoteFollowupSchedules { get; set; } = new List<CrmQuoteFollowupSchedule>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();

    public virtual SysWorkflowTaskType? CrmnbatypeDefaultWorkflowTaskTypeCodeNavigation { get; set; }

    public virtual ICollection<SysCrmcallActionType> SysCrmcallActionTypes { get; set; } = new List<SysCrmcallActionType>();
}
