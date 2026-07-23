using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmSentimentSignal
{
    public Guid CrmsentimentId { get; set; }

    public Guid? CrmsentimentOrgId { get; set; }

    public Guid? CrmsentimentLeadId { get; set; }

    public Guid? CrmsentimentOpportunityId { get; set; }

    public string? CrmsentimentSourceTable { get; set; }

    public Guid? CrmsentimentSourceId { get; set; }

    public string? CrmsentimentSentimentCode { get; set; }

    public decimal? CrmsentimentScore { get; set; }

    public string? CrmsentimentTextEvidence { get; set; }

    public DateTime CrmsentimentDetectedAt { get; set; }

    public Guid? CrmsentimentAitaskRunId { get; set; }

    public virtual AiTaskRun? CrmsentimentAitaskRun { get; set; }

    public virtual CrmLead? CrmsentimentLead { get; set; }

    public virtual CrmOpportunity? CrmsentimentOpportunity { get; set; }

    public virtual OrgMaster? CrmsentimentOrg { get; set; }

    public virtual SysCrmfeedbackSentiment? CrmsentimentSentimentCodeNavigation { get; set; }
}
