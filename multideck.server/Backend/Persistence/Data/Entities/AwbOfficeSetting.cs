using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Office-level AWB/e-AWB defaults for companies with multiple offices in a company-per-database SaaS deployment.
/// </summary>
public partial class AwbOfficeSetting
{
    public Guid AwbosId { get; set; }

    public Guid AwbosOrgOfficeId { get; set; }

    public string? AwbosOfficeCodeSnapshot { get; set; }

    public string? AwbosOfficeNameSnapshot { get; set; }

    public Guid? AwbosDefaultAirportId { get; set; }

    public string? AwbosDefaultAirportCodeSnapshot { get; set; }

    public Guid? AwbosDefaultIataregistrationId { get; set; }

    public Guid? AwbosDefaultCurrencyId { get; set; }

    public string? AwbosDefaultCurrencyCodeSnapshot { get; set; }

    public string? AwbosDefaultWeightUom { get; set; }

    public string? AwbosDefaultDimensionUom { get; set; }

    public string? AwbosDefaultVolumeUom { get; set; }

    public string? AwbosDefaultTimeZone { get; set; }

    public string? AwbosDefaultDataResidencyRegion { get; set; }

    public bool? AwbosRequireCarrierAcknowledgement { get; set; }

    public bool? AwbosAllowCargoImp { get; set; }

    public string AwbosSettingsJson { get; set; } = null!;

    public bool AwbosIsActive { get; set; }

    public DateTime AwbosCreatedAt { get; set; }

    public Guid? AwbosCreatedBy { get; set; }

    public DateTime AwbosUpdatedAt { get; set; }

    public Guid? AwbosUpdatedBy { get; set; }
}
