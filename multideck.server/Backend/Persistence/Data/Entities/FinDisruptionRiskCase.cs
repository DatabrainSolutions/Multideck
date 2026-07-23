using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDisruptionRiskCase
{
    public Guid FindisruptId { get; set; }

    public Guid? FindisruptAiinsightId { get; set; }

    public Guid FindisruptCustomerOrgId { get; set; }

    public Guid FindisruptJobId { get; set; }

    public string FindisruptStatusCode { get; set; } = null!;

    public string FindisruptSeverityCode { get; set; } = null!;

    public string? FindisruptRiskSignalCode { get; set; }

    public string? FindisruptShipmentStageCode { get; set; }

    public string? FindisruptHoldPointCode { get; set; }

    public decimal FindisruptPaymentRequiredAmount { get; set; }

    public string FindisruptDisruptionDescription { get; set; } = null!;

    public string? FindisruptCustomerImpactDescription { get; set; }

    public string? FindisruptRecommendedActionCode { get; set; }

    public DateTime? FindisruptDueAt { get; set; }

    public DateTime FindisruptCreatedAt { get; set; }

    public virtual FinAiinsight? FindisruptAiinsight { get; set; }

    public virtual OrgMaster FindisruptCustomerOrg { get; set; } = null!;

    public virtual JobHeader FindisruptJob { get; set; } = null!;

    public virtual SysFinanceCreditControlAction? FindisruptRecommendedActionCodeNavigation { get; set; }

    public virtual SysFinanceRiskSignalType? FindisruptRiskSignalCodeNavigation { get; set; }

    public virtual SysFinanceInsightSeverity FindisruptSeverityCodeNavigation { get; set; } = null!;
}
