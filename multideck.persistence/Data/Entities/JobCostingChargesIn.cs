using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCostingChargesIn
{
    public Guid JcinId { get; set; }

    public Guid JobId { get; set; }

    public Guid? JcinFrom { get; set; }

    public Guid? JcinChargeCode { get; set; }

    public string? JcinDescription { get; set; }

    public string? JcinInternalNotes { get; set; }

    public string? JcinExternalNotes { get; set; }

    public int? JcinFromCurr { get; set; }

    public decimal? JcinFromRoe { get; set; }

    public decimal? JcinExpectedNetCostCurr { get; set; }

    public decimal? JcinExpectedTaxAmountCurr { get; set; }

    public string? JcinExpectedTaxCode { get; set; }

    public decimal? JcinExpectedNetCostLocal { get; set; }

    public decimal? JcinExpectedTaxAmountLocal { get; set; }

    public decimal? JcinActualRoe { get; set; }

    public decimal? JcinActualNetCostCurr { get; set; }

    public decimal? JcinActualTaxAmountCurr { get; set; }

    public string? JcinActualTaxCode { get; set; }

    public decimal? JcinActualNetCostLocal { get; set; }

    public decimal? JcinActualTaxAmountLocal { get; set; }

    public int JcinMatchStatus { get; set; }

    public bool? JcinShowCurrency { get; set; }

    public bool? JcinShowLocal { get; set; }

    public byte[] JcinTs { get; set; } = null!;

    public virtual JobHeader Job { get; set; } = null!;

    public virtual ICollection<AccPaymentsLine> AccPaymentsLines { get; set; } = new List<AccPaymentsLine>();
}
