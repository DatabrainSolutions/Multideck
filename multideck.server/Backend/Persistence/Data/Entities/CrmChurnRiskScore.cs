using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmChurnRiskScore
{
    public Guid CrmchurnId { get; set; }

    public Guid CrmchurnAccountId { get; set; }

    public DateOnly CrmchurnAsOfDate { get; set; }

    public decimal CrmchurnRiskScore { get; set; }

    public string? CrmchurnRiskLevel { get; set; }

    public string? CrmchurnReason { get; set; }

    public string? CrmchurnRecommendedActionCode { get; set; }

    public Guid? CrmchurnAitaskRunId { get; set; }

    public DateTime CrmchurnCreatedAt { get; set; }

    public virtual CrmAccountProfile CrmchurnAccount { get; set; } = null!;

    public virtual AiTaskRun? CrmchurnAitaskRun { get; set; }

    public virtual SysCrmnextBestActionType? CrmchurnRecommendedActionCodeNavigation { get; set; }
}
