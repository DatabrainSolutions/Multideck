using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// One-row AWB charge totals for print and accounting.
/// </summary>
public partial class AwbChargeSummary
{
    public Guid AwbcsId { get; set; }

    public Guid AwbcsAwbid { get; set; }

    public Guid? AwbcsCurrencyId { get; set; }

    public string? AwbcsCurrencyCodeSnapshot { get; set; }

    public decimal AwbcsPrepaidWeightChargeAmount { get; set; }

    public decimal AwbcsCollectWeightChargeAmount { get; set; }

    public decimal AwbcsPrepaidValuationChargeAmount { get; set; }

    public decimal AwbcsCollectValuationChargeAmount { get; set; }

    public decimal AwbcsPrepaidTaxAmount { get; set; }

    public decimal AwbcsCollectTaxAmount { get; set; }

    public decimal AwbcsPrepaidDueAgentAmount { get; set; }

    public decimal AwbcsCollectDueAgentAmount { get; set; }

    public decimal AwbcsPrepaidDueCarrierAmount { get; set; }

    public decimal AwbcsCollectDueCarrierAmount { get; set; }

    public decimal AwbcsPrepaidGrandTotalAmount { get; set; }

    public decimal AwbcsCollectGrandTotalAmount { get; set; }

    public decimal AwbcsTotalAmount { get; set; }

    public DateTime AwbcsCreatedAt { get; set; }

    public DateTime AwbcsUpdatedAt { get; set; }

    public virtual AwbHeader AwbcsAwb { get; set; } = null!;
}
