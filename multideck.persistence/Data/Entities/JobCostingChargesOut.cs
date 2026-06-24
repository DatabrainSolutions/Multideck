using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCostingChargesOut
{
    public Guid JcoutId { get; set; }

    public Guid JobId { get; set; }

    public Guid? JcoutTo { get; set; }

    public Guid? JcoutChargeCode { get; set; }

    public string? JcoutDescription { get; set; }

    public string? JcoutInternalNotes { get; set; }

    public string? JcoutExternalNotes { get; set; }

    public int? JcoutToCurr { get; set; }

    public decimal? JcoutToRoe { get; set; }

    public decimal? JcoutExpectedNetCostCurr { get; set; }

    public decimal? JcoutExpectedTaxAmountCurr { get; set; }

    public string? JcoutExpectedTaxCode { get; set; }

    public decimal? JcoutExpectedNetCostLocal { get; set; }

    public decimal? JcoutExpectedTaxAmountLocal { get; set; }

    public decimal? JcoutActualRoe { get; set; }

    public decimal? JcoutActualNetCostCurr { get; set; }

    public decimal? JcoutActualTaxAmountCurr { get; set; }

    public string? JcoutActualTaxCode { get; set; }

    public decimal? JcoutActualNetCostLocal { get; set; }

    public decimal? JcoutActualTaxAmountLocal { get; set; }

    public bool JcoutInvoiced { get; set; }

    public Guid? JcoutInvoice { get; set; }

    public int JcoutPaidStatus { get; set; }

    public bool? JcoutShowCurrency { get; set; }

    public bool? JcoutShowLocal { get; set; }

    public byte[] JcoutTs { get; set; } = null!;

    public virtual JobHeader Job { get; set; } = null!;

    public virtual ICollection<AccReceiptsLine> AccReceiptsLines { get; set; } = new List<AccReceiptsLine>();
}
