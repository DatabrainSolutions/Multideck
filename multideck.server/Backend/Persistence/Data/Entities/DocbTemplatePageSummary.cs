using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplatePageSummary
{
    public Guid? DocbtId { get; set; }

    public string? DocbtCode { get; set; }

    public string? DocbtName { get; set; }

    public Guid? DocbtvId { get; set; }

    public int? DocbtvVersionNo { get; set; }

    public Guid? DocbpgId { get; set; }

    public string? DocbpgPageTypeCode { get; set; }

    public string? PageTypeName { get; set; }

    public int? DocbpgSortOrder { get; set; }

    public string? DocbpgPageName { get; set; }

    public decimal? DocbpgWidthMm { get; set; }

    public decimal? DocbpgHeightMm { get; set; }

    public string? DocbpgOrientation { get; set; }

    public string? DocbpgMarginsJson { get; set; }

    public string? HeaderSectionCode { get; set; }

    public string? FooterSectionCode { get; set; }

    public string? BackgroundAssetCode { get; set; }

    public string? WatermarkAssetCode { get; set; }

    public string? DocbpgSettingsJson { get; set; }
}
