using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsServiceContractLine
{
    public Guid WmscontractLineId { get; set; }

    public Guid WmscontractLineContractId { get; set; }

    public int WmscontractLineLineNo { get; set; }

    public string WmscontractLineServiceCode { get; set; } = null!;

    public string WmscontractLineServiceName { get; set; } = null!;

    public string WmscontractLineBillingBasisCode { get; set; } = null!;

    public Guid? WmscontractLineChargeCodeId { get; set; }

    public decimal WmscontractLineUnitRate { get; set; }

    public decimal WmscontractLineMinimumAmount { get; set; }

    public string WmscontractLineCurrencyCode { get; set; } = null!;

    public decimal WmscontractLineFreeQuantity { get; set; }

    public string WmscontractLineRulesJson { get; set; } = null!;

    public bool WmscontractLineIsActive { get; set; }

    public virtual SysWmsbillingBasis WmscontractLineBillingBasisCodeNavigation { get; set; } = null!;

    public virtual WmsServiceContract WmscontractLineContract { get; set; } = null!;
}
