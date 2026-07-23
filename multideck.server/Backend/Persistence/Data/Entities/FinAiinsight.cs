using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAiinsight
{
    public Guid FinaiinsightId { get; set; }

    public Guid? FinaiinsightRuleId { get; set; }

    public Guid? FinaiinsightAitaskRunId { get; set; }

    public string FinaiinsightInsightTypeCode { get; set; } = null!;

    public string FinaiinsightStatusCode { get; set; } = null!;

    public string FinaiinsightSeverityCode { get; set; } = null!;

    public string FinaiinsightTitle { get; set; } = null!;

    public string FinaiinsightSummary { get; set; } = null!;

    public string? FinaiinsightRecommendation { get; set; }

    public Guid? FinaiinsightCustomerOrgId { get; set; }

    public Guid? FinaiinsightJobId { get; set; }

    public Guid? FinaiinsightDocumentId { get; set; }

    public decimal FinaiinsightAmountAtRisk { get; set; }

    public decimal FinaiinsightAdditionalCostRiskAmount { get; set; }

    public string FinaiinsightCurrencyCodeSnapshot { get; set; } = null!;

    public decimal? FinaiinsightConfidenceScore { get; set; }

    public decimal? FinaiinsightRiskScore { get; set; }

    public string FinaiinsightExpectedImpactJson { get; set; } = null!;

    public string FinaiinsightEvidenceJson { get; set; } = null!;

    public DateTime? FinaiinsightExpiresAt { get; set; }

    public DateTime FinaiinsightCreatedAt { get; set; }

    public Guid? FinaiinsightCreatedBy { get; set; }

    public DateTime? FinaiinsightActionedAt { get; set; }

    public Guid? FinaiinsightActionedBy { get; set; }

    public DateTime? FinaiinsightDismissedAt { get; set; }

    public Guid? FinaiinsightDismissedBy { get; set; }

    public string? FinaiinsightDismissalReason { get; set; }

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();

    public virtual ICollection<FinAiinsightAction> FinAiinsightActions { get; set; } = new List<FinAiinsightAction>();

    public virtual ICollection<FinAiinsightTarget> FinAiinsightTargets { get; set; } = new List<FinAiinsightTarget>();

    public virtual ICollection<FinCreditHold> FinCreditHolds { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<FinCreditStopRecommendation> FinCreditStopRecommendations { get; set; } = new List<FinCreditStopRecommendation>();

    public virtual ICollection<FinCustomerPaymentBehaviour> FinCustomerPaymentBehaviours { get; set; } = new List<FinCustomerPaymentBehaviour>();

    public virtual ICollection<FinDebtCase> FinDebtCases { get; set; } = new List<FinDebtCase>();

    public virtual ICollection<FinDisruptionRiskCase> FinDisruptionRiskCases { get; set; } = new List<FinDisruptionRiskCase>();

    public virtual ICollection<FinKpirecommendation> FinKpirecommendations { get; set; } = new List<FinKpirecommendation>();

    public virtual CmpUser? FinaiinsightActionedByNavigation { get; set; }

    public virtual AiTaskRun? FinaiinsightAitaskRun { get; set; }

    public virtual CmpUser? FinaiinsightCreatedByNavigation { get; set; }

    public virtual OrgMaster? FinaiinsightCustomerOrg { get; set; }

    public virtual CmpUser? FinaiinsightDismissedByNavigation { get; set; }

    public virtual FinDocument? FinaiinsightDocument { get; set; }

    public virtual SysFinanceInsightType FinaiinsightInsightTypeCodeNavigation { get; set; } = null!;

    public virtual JobHeader? FinaiinsightJob { get; set; }

    public virtual FinAiinsightRule? FinaiinsightRule { get; set; }

    public virtual SysFinanceInsightSeverity FinaiinsightSeverityCodeNavigation { get; set; } = null!;

    public virtual SysFinanceInsightStatus FinaiinsightStatusCodeNavigation { get; set; } = null!;
}
