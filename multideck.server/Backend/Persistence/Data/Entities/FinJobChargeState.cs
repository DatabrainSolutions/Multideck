using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobChargeState
{
    public Guid FinchargeStateId { get; set; }

    public Guid FinchargeStateJobId { get; set; }

    public Guid? FinchargeStateChargeInId { get; set; }

    public Guid? FinchargeStateChargeOutId { get; set; }

    public string FinchargeStateLedgerTypeCode { get; set; } = null!;

    public string FinchargeStateStatusCode { get; set; } = null!;

    public decimal FinchargeStateExpectedAmount { get; set; }

    public decimal FinchargeStateInvoicedAmount { get; set; }

    public decimal FinchargeStateCreditedAmount { get; set; }

    public decimal FinchargeStatePaidAmount { get; set; }

    public decimal FinchargeStateOutstandingAmount { get; set; }

    public string FinchargeStateCurrencyCodeSnapshot { get; set; } = null!;

    public Guid? FinchargeStateLastDocumentId { get; set; }

    public DateTime FinchargeStateUpdatedAt { get; set; }

    public virtual ICollection<FinJobChargeAllocation> FinJobChargeAllocations { get; set; } = new List<FinJobChargeAllocation>();

    public virtual JobCostingChargesIn? FinchargeStateChargeIn { get; set; }

    public virtual JobCostingChargesOut? FinchargeStateChargeOut { get; set; }

    public virtual JobHeader FinchargeStateJob { get; set; } = null!;

    public virtual FinDocument? FinchargeStateLastDocument { get; set; }

    public virtual SysFinanceLedgerType FinchargeStateLedgerTypeCodeNavigation { get; set; } = null!;
}
