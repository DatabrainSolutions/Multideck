using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlCharge
{
    public Guid BlcId { get; set; }

    public Guid BlcBlId { get; set; }

    public string BlcChargeType { get; set; } = null!;

    public string? BlcDescription { get; set; }

    public decimal? BlcAmount { get; set; }

    public Guid? BlcCurrencyId { get; set; }

    public string? BlcCurrencyCodeSnapshot { get; set; }

    public string? BlcPaymentArrangement { get; set; }

    public Guid? BlcPaymentPlaceLocationId { get; set; }

    public string? BlcPaymentPlaceSnapshot { get; set; }

    public bool BlcIsPrinted { get; set; }

    public int BlcLineNo { get; set; }

    public virtual BlHeader BlcBl { get; set; } = null!;

    public virtual SysBlchargeType BlcChargeTypeNavigation { get; set; } = null!;
}
