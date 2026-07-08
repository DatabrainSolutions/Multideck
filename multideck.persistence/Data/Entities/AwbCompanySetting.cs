using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Single-row AWB/e-AWB defaults for a company-per-database SaaS deployment.
/// </summary>
public partial class AwbCompanySetting
{
    public Guid AwbcfgId { get; set; }

    public bool AwbcfgSingletonKey { get; set; }

    public string? AwbcfgDefaultCargoXmlversion { get; set; }

    public string AwbcfgDefaultMessageStandard { get; set; } = null!;

    public Guid? AwbcfgDefaultCurrencyId { get; set; }

    public string? AwbcfgDefaultCurrencyCodeSnapshot { get; set; }

    public string AwbcfgDefaultWeightUom { get; set; } = null!;

    public string AwbcfgDefaultDimensionUom { get; set; } = null!;

    public string AwbcfgDefaultVolumeUom { get; set; } = null!;

    public string AwbcfgDefaultTimeZone { get; set; } = null!;

    public string? AwbcfgDefaultDataResidencyRegion { get; set; }

    public bool AwbcfgRequireCargoXmlvalidation { get; set; }

    public bool AwbcfgRequireCarrierAcknowledgement { get; set; }

    public bool AwbcfgAllowPortalIssuedAwb { get; set; }

    public bool AwbcfgAllowCargoImp { get; set; }

    public bool AwbcfgAllowCompanyCustomCodes { get; set; }

    public string AwbcfgSettingsJson { get; set; } = null!;

    public DateTime AwbcfgCreatedAt { get; set; }

    public Guid? AwbcfgCreatedBy { get; set; }

    public DateTime AwbcfgUpdatedAt { get; set; }

    public Guid? AwbcfgUpdatedBy { get; set; }
}
