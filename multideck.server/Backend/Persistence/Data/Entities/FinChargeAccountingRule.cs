using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinChargeAccountingRule
{
    public Guid FincarId { get; set; }

    public string FincarCode { get; set; } = null!;

    public string FincarName { get; set; } = null!;

    public Guid? FincarChargeId { get; set; }

    public string? FincarChargeCodeSnapshot { get; set; }

    public string FincarLedgerTypeCode { get; set; } = null!;

    public string FincarLineTypeCode { get; set; } = null!;

    public Guid? FincarNominalAccountId { get; set; }

    public Guid? FincarTaxCodeId { get; set; }

    public int FincarPriority { get; set; }

    public bool FincarIsActive { get; set; }

    public virtual RateChargeCode? FincarCharge { get; set; }

    public virtual SysFinanceLedgerType FincarLedgerTypeCodeNavigation { get; set; } = null!;

    public virtual SysFinanceLineType FincarLineTypeCodeNavigation { get; set; } = null!;

    public virtual FinNominalAccount? FincarNominalAccount { get; set; }

    public virtual FinTaxCode? FincarTaxCode { get; set; }
}
