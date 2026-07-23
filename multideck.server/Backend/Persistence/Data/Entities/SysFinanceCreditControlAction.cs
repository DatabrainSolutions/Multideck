using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCreditControlAction
{
    public string FinccaCode { get; set; } = null!;

    public string FinccaName { get; set; } = null!;

    public string? FinccaDescription { get; set; }

    public int FinccaSortOrder { get; set; }

    public bool FinccaIsActive { get; set; }

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();

    public virtual ICollection<FinAiinsightAction> FinAiinsightActions { get; set; } = new List<FinAiinsightAction>();

    public virtual ICollection<FinCreditStopRecommendation> FinCreditStopRecommendations { get; set; } = new List<FinCreditStopRecommendation>();

    public virtual ICollection<FinCustomerPaymentBehaviour> FinCustomerPaymentBehaviours { get; set; } = new List<FinCustomerPaymentBehaviour>();

    public virtual ICollection<FinDisruptionRiskCase> FinDisruptionRiskCases { get; set; } = new List<FinDisruptionRiskCase>();
}
