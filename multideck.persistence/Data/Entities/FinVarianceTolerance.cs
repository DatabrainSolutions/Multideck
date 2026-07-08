using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVarianceTolerance
{
    public Guid FinvarTolId { get; set; }

    public string FinvarTolCode { get; set; } = null!;

    public string FinvarTolName { get; set; } = null!;

    public string? FinvarTolTypeCode { get; set; }

    public Guid? FinvarTolCustomerOrgId { get; set; }

    public Guid? FinvarTolSupplierOrgId { get; set; }

    public Guid? FinvarTolChargeId { get; set; }

    public string? FinvarTolCurrencyCodeSnapshot { get; set; }

    public decimal FinvarTolMaxAmount { get; set; }

    public decimal FinvarTolMaxPercent { get; set; }

    public bool FinvarTolAutoApprove { get; set; }

    public bool FinvarTolIsActive { get; set; }

    public virtual RateChargeCode? FinvarTolCharge { get; set; }

    public virtual OrgMaster? FinvarTolCustomerOrg { get; set; }

    public virtual OrgMaster? FinvarTolSupplierOrg { get; set; }

    public virtual SysFinanceVarianceType? FinvarTolTypeCodeNavigation { get; set; }
}
