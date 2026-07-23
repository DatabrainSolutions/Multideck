using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceLicenseLine
{
    public Guid TcelicLineId { get; set; }

    public Guid TcelicLineLicenseId { get; set; }

    public int TcelicLineLineNo { get; set; }

    public string? TcelicLineHscode { get; set; }

    public string? TcelicLineEccncode { get; set; }

    public string? TcelicLineGoodsDescription { get; set; }

    public string? TcelicLineOriginCountryCode { get; set; }

    public string? TcelicLineDestinationCountryCode { get; set; }

    public string? TcelicLineEndUseDescription { get; set; }

    public decimal? TcelicLineValueLimitAmount { get; set; }

    public decimal TcelicLineValueUsedAmount { get; set; }

    public decimal? TcelicLineQuantityLimit { get; set; }

    public decimal TcelicLineQuantityUsed { get; set; }

    public string? TcelicLineUnitCode { get; set; }

    public string TcelicLineConditionsJson { get; set; } = null!;

    public DateTime TcelicLineCreatedAt { get; set; }

    public virtual ICollection<TceLicenseUsage> TceLicenseUsages { get; set; } = new List<TceLicenseUsage>();

    public virtual TceLicense TcelicLineLicense { get; set; } = null!;
}
