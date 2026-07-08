using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciTaxCodeMapping
{
    public Guid AccitmId { get; set; }

    public Guid AccitmConnectionId { get; set; }

    public string AccitmLocalTaxCode { get; set; } = null!;

    public string? AccitmLocalTaxDescription { get; set; }

    public string? AccitmLocalCountryCode { get; set; }

    public string AccitmDirectionCode { get; set; } = null!;

    public string? AccitmProviderTaxId { get; set; }

    public string AccitmProviderTaxCode { get; set; } = null!;

    public string? AccitmProviderTaxName { get; set; }

    public decimal? AccitmTaxRatePercent { get; set; }

    public bool AccitmIsActive { get; set; }

    public DateTime AccitmCreatedAt { get; set; }

    public virtual AcciConnection AccitmConnection { get; set; } = null!;

    public virtual SysAccountingDirection AccitmDirectionCodeNavigation { get; set; } = null!;
}
