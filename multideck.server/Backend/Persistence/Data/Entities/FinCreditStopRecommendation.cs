using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditStopRecommendation
{
    public Guid FinstopRecId { get; set; }

    public Guid? FinstopRecAiinsightId { get; set; }

    public Guid FinstopRecCustomerOrgId { get; set; }

    public Guid? FinstopRecJobId { get; set; }

    public string FinstopRecActionCode { get; set; } = null!;

    public string FinstopRecSeverityCode { get; set; } = null!;

    public string FinstopRecStatusCode { get; set; } = null!;

    public decimal FinstopRecCurrentExposureAmount { get; set; }

    public decimal FinstopRecOverdueAmount { get; set; }

    public decimal FinstopRecCreditLimitAmount { get; set; }

    public string FinstopRecReason { get; set; } = null!;

    public DateTime FinstopRecRecommendedAt { get; set; }

    public DateTime? FinstopRecDecidedAt { get; set; }

    public Guid? FinstopRecDecidedBy { get; set; }

    public string? FinstopRecDecisionReason { get; set; }

    public virtual SysFinanceCreditControlAction FinstopRecActionCodeNavigation { get; set; } = null!;

    public virtual FinAiinsight? FinstopRecAiinsight { get; set; }

    public virtual OrgMaster FinstopRecCustomerOrg { get; set; } = null!;

    public virtual CmpUser? FinstopRecDecidedByNavigation { get; set; }

    public virtual JobHeader? FinstopRecJob { get; set; }

    public virtual SysFinanceInsightSeverity FinstopRecSeverityCodeNavigation { get; set; } = null!;
}
