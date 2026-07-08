using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceLicenseUsageSummary
{
    public Guid? TcelicenseId { get; set; }

    public string? TcelicenseNumber { get; set; }

    public string? TcelicenseTypeCode { get; set; }

    public string? TcelicenseStatusCode { get; set; }

    public Guid? TcelicenseCustomerOrgId { get; set; }

    public string? TcelicenseCustomerName { get; set; }

    public string? TcelicenseJurisdictionCode { get; set; }

    public DateOnly? TcelicenseExpiryDate { get; set; }

    public string? TcelicenseCurrencyCodeSnapshot { get; set; }

    public decimal? TcelicenseValueLimitAmount { get; set; }

    public decimal? TcelicenseValueUsedAmount { get; set; }

    public decimal? TcelicenseValueRemainingAmount { get; set; }

    public decimal? TcelicenseQuantityLimit { get; set; }

    public decimal? TcelicenseQuantityUsed { get; set; }

    public decimal? TcelicenseQuantityRemaining { get; set; }

    public int? TcelicenseUsageCount { get; set; }
}
