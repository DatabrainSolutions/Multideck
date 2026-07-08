using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceInsightSeverity
{
    public string FininssCode { get; set; } = null!;

    public string FininssName { get; set; } = null!;

    public string? FininssDescription { get; set; }

    public int FininssSortOrder { get; set; }

    public bool FininssIsActive { get; set; }

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();

    public virtual ICollection<FinCreditStopRecommendation> FinCreditStopRecommendations { get; set; } = new List<FinCreditStopRecommendation>();

    public virtual ICollection<FinDebtCase> FinDebtCases { get; set; } = new List<FinDebtCase>();

    public virtual ICollection<FinDisruptionRiskCase> FinDisruptionRiskCases { get; set; } = new List<FinDisruptionRiskCase>();

    public virtual ICollection<FinJobFinanceException> FinJobFinanceExceptions { get; set; } = new List<FinJobFinanceException>();

    public virtual ICollection<FinReconciliationItem> FinReconciliationItems { get; set; } = new List<FinReconciliationItem>();
}
