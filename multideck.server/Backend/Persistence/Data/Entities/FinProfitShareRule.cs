using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinProfitShareRule
{
    public Guid FinpsruleId { get; set; }

    public Guid FinpsruleAgreementId { get; set; }

    public Guid? FinpsruleChargeId { get; set; }

    public string? FinpsruleModeCode { get; set; }

    public decimal FinpsrulePercent { get; set; }

    public decimal FinpsruleFixedAmount { get; set; }

    public decimal FinpsruleMinimumAmount { get; set; }

    public decimal? FinpsruleMaximumAmount { get; set; }

    public bool FinpsrulePayOnlyWhenCustomerPaid { get; set; }

    public bool FinpsruleIsActive { get; set; }

    public virtual ICollection<FinProfitShareItem> FinProfitShareItems { get; set; } = new List<FinProfitShareItem>();

    public virtual FinProfitShareAgreement FinpsruleAgreement { get; set; } = null!;

    public virtual RateChargeCode? FinpsruleCharge { get; set; }
}
