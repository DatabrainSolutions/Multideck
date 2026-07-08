using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTheme
{
    public Guid DocbthId { get; set; }

    public string DocbthName { get; set; } = null!;

    public string? DocbthDescription { get; set; }

    public Guid? DocbthOrgOfficeId { get; set; }

    public Guid? DocbthLegalEntityId { get; set; }

    public Guid? DocbthBrandId { get; set; }

    public string DocbthPageSettingsJson { get; set; } = null!;

    public string DocbthStyleTokensJson { get; set; } = null!;

    public string DocbthAssetRefsJson { get; set; } = null!;

    public bool DocbthIsDefault { get; set; }

    public bool DocbthIsActive { get; set; }

    public DateTime DocbthCreatedAt { get; set; }

    public Guid? DocbthCreatedBy { get; set; }

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersions { get; set; } = new List<DocbTemplateVersion>();

    public virtual CmpBrand? DocbthBrand { get; set; }

    public virtual CmpUser? DocbthCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? DocbthLegalEntity { get; set; }

    public virtual CmpOffice? DocbthOrgOffice { get; set; }

    public virtual ICollection<PortalSite> PortalSites { get; set; } = new List<PortalSite>();
}
