using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbAssetLibrary
{
    public Guid DocbasId { get; set; }

    public string DocbasCode { get; set; } = null!;

    public string DocbasName { get; set; } = null!;

    public string DocbasAssetTypeCode { get; set; } = null!;

    public Guid? DocbasOrgOfficeId { get; set; }

    public Guid? DocbasLegalEntityId { get; set; }

    public Guid? DocbasBrandId { get; set; }

    public Guid? DocbasCustomerOrgId { get; set; }

    public string DocbasLanguageCode { get; set; } = null!;

    public string? DocbasFileName { get; set; }

    public string? DocbasStorageBucket { get; set; }

    public string? DocbasStoragePath { get; set; }

    public string? DocbasFileUrl { get; set; }

    public string? DocbasMimeType { get; set; }

    public long? DocbasFileSizeBytes { get; set; }

    public string? DocbasSha256 { get; set; }

    public int? DocbasWidthPx { get; set; }

    public int? DocbasHeightPx { get; set; }

    public int? DocbasDpi { get; set; }

    public bool DocbasIsSystem { get; set; }

    public bool DocbasIsApproved { get; set; }

    public bool DocbasIsActive { get; set; }

    public string DocbasMetadataJson { get; set; } = null!;

    public DateTime DocbasCreatedAt { get; set; }

    public Guid? DocbasCreatedBy { get; set; }

    public DateTime DocbasUpdatedAt { get; set; }

    public Guid? DocbasUpdatedBy { get; set; }

    public virtual ICollection<DocbAssetVersion> DocbAssetVersions { get; set; } = new List<DocbAssetVersion>();

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual ICollection<DocbTemplatePage> DocbTemplatePageDocbpgBackgroundAssets { get; set; } = new List<DocbTemplatePage>();

    public virtual ICollection<DocbTemplatePage> DocbTemplatePageDocbpgWatermarkAssets { get; set; } = new List<DocbTemplatePage>();

    public virtual SysDocBuilderAssetType DocbasAssetTypeCodeNavigation { get; set; } = null!;

    public virtual CmpBrand? DocbasBrand { get; set; }

    public virtual CmpUser? DocbasCreatedByNavigation { get; set; }

    public virtual OrgMaster? DocbasCustomerOrg { get; set; }

    public virtual CmpLegalEntity? DocbasLegalEntity { get; set; }

    public virtual CmpOffice? DocbasOrgOffice { get; set; }

    public virtual CmpUser? DocbasUpdatedByNavigation { get; set; }

    public virtual ICollection<PortalSite> PortalSites { get; set; } = new List<PortalSite>();
}
