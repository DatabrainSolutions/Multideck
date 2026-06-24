using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCurrency
{
    public Guid CurrencyId { get; set; }

    public string? CurrencyCode { get; set; }

    public string? CurrencySymbol { get; set; }

    public string? CurrencyName { get; set; }

    public string? CurrencyUnitName { get; set; }

    public string? CurrencySubUnitName { get; set; }

    public int? CurrencySubUnitRatio { get; set; }
}
