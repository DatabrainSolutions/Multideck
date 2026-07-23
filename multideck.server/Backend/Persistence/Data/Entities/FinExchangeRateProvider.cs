using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinExchangeRateProvider
{
    public Guid FinrateProviderId { get; set; }

    public string FinrateProviderCode { get; set; } = null!;

    public string FinrateProviderName { get; set; } = null!;

    public string FinrateProviderProviderTypeCode { get; set; } = null!;

    public bool FinrateProviderIsOfficial { get; set; }

    public bool FinrateProviderIsMidMarketSource { get; set; }

    public string? FinrateProviderBaseCurrencyCode { get; set; }

    public string? FinrateProviderApibaseUrl { get; set; }

    public string? FinrateProviderSecretRef { get; set; }

    public string FinrateProviderSettingsJson { get; set; } = null!;

    public bool FinrateProviderIsActive { get; set; }

    public DateTime FinrateProviderCreatedAt { get; set; }

    public Guid? FinrateProviderCreatedBy { get; set; }

    public virtual ICollection<FinExchangeRateImport> FinExchangeRateImports { get; set; } = new List<FinExchangeRateImport>();

    public virtual ICollection<FinExchangeRate> FinExchangeRates { get; set; } = new List<FinExchangeRate>();

    public virtual CmpUser? FinrateProviderCreatedByNavigation { get; set; }
}
