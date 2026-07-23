using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplatePage
{
    public Guid DocbpgId { get; set; }

    public Guid DocbpgTemplateVersionId { get; set; }

    public string DocbpgPageTypeCode { get; set; } = null!;

    public int DocbpgSortOrder { get; set; }

    public string? DocbpgPageName { get; set; }

    public decimal? DocbpgWidthMm { get; set; }

    public decimal? DocbpgHeightMm { get; set; }

    public string DocbpgOrientation { get; set; } = null!;

    public string DocbpgMarginsJson { get; set; } = null!;

    public Guid? DocbpgHeaderSectionId { get; set; }

    public Guid? DocbpgFooterSectionId { get; set; }

    public Guid? DocbpgBackgroundAssetId { get; set; }

    public Guid? DocbpgWatermarkAssetId { get; set; }

    public string DocbpgSettingsJson { get; set; } = null!;

    public DateTime DocbpgCreatedAt { get; set; }

    public Guid? DocbpgCreatedBy { get; set; }

    public virtual DocbAssetLibrary? DocbpgBackgroundAsset { get; set; }

    public virtual CmpUser? DocbpgCreatedByNavigation { get; set; }

    public virtual DocbSectionDefinition? DocbpgFooterSection { get; set; }

    public virtual DocbSectionDefinition? DocbpgHeaderSection { get; set; }

    public virtual SysDocBuilderPageType DocbpgPageTypeCodeNavigation { get; set; } = null!;

    public virtual DocbTemplateVersion DocbpgTemplateVersion { get; set; } = null!;

    public virtual DocbAssetLibrary? DocbpgWatermarkAsset { get; set; }
}
