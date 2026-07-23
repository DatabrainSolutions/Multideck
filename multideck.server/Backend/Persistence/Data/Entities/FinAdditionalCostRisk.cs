using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAdditionalCostRisk
{
    public Guid FincostRiskId { get; set; }

    public Guid? FincostRiskAiinsightId { get; set; }

    public string FincostRiskCostTypeCode { get; set; } = null!;

    public Guid? FincostRiskCustomerOrgId { get; set; }

    public Guid? FincostRiskJobId { get; set; }

    public Guid? FincostRiskDocumentId { get; set; }

    public string FincostRiskStatusCode { get; set; } = null!;

    public string FincostRiskSeverityCode { get; set; } = null!;

    public decimal FincostRiskEstimatedAmount { get; set; }

    public decimal FincostRiskLocalEstimatedAmount { get; set; }

    public string FincostRiskCurrencyCodeSnapshot { get; set; } = null!;

    public DateTime? FincostRiskRiskStartAt { get; set; }

    public DateTime? FincostRiskRiskEndAt { get; set; }

    public string FincostRiskReason { get; set; } = null!;

    public string? FincostRiskPreventionActionCode { get; set; }

    public DateTime FincostRiskCreatedAt { get; set; }

    public virtual FinAiinsight? FincostRiskAiinsight { get; set; }

    public virtual SysFinanceAdditionalCostType FincostRiskCostTypeCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? FincostRiskCustomerOrg { get; set; }

    public virtual FinDocument? FincostRiskDocument { get; set; }

    public virtual JobHeader? FincostRiskJob { get; set; }

    public virtual SysFinanceCreditControlAction? FincostRiskPreventionActionCodeNavigation { get; set; }

    public virtual SysFinanceInsightSeverity FincostRiskSeverityCodeNavigation { get; set; } = null!;
}
