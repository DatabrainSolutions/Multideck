using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbLibraryPack
{
    public Guid DocblpId { get; set; }

    public string DocblpCode { get; set; } = null!;

    public string DocblpName { get; set; } = null!;

    public string? DocblpDataScopeCode { get; set; }

    public string DocblpStatusCode { get; set; } = null!;

    public Guid? DocblpOrgOfficeId { get; set; }

    public Guid? DocblpLegalEntityId { get; set; }

    public Guid? DocblpBrandId { get; set; }

    public Guid? DocblpCustomerOrgId { get; set; }

    public string DocblpLanguageCode { get; set; } = null!;

    public string? DocblpDescription { get; set; }

    public string DocblpModeCodesJson { get; set; } = null!;

    public string DocblpDirectionCodesJson { get; set; } = null!;

    public string DocblpCountryCodesJson { get; set; } = null!;

    public string DocblpSettingsJson { get; set; } = null!;

    public bool DocblpIsSystem { get; set; }

    public bool DocblpIsUserEditable { get; set; }

    public bool DocblpIsActive { get; set; }

    public DateTime DocblpCreatedAt { get; set; }

    public Guid? DocblpCreatedBy { get; set; }

    public DateTime DocblpUpdatedAt { get; set; }

    public Guid? DocblpUpdatedBy { get; set; }

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual CmpBrand? DocblpBrand { get; set; }

    public virtual CmpUser? DocblpCreatedByNavigation { get; set; }

    public virtual OrgMaster? DocblpCustomerOrg { get; set; }

    public virtual SysDocBuilderDataScope? DocblpDataScopeCodeNavigation { get; set; }

    public virtual CmpLegalEntity? DocblpLegalEntity { get; set; }

    public virtual CmpOffice? DocblpOrgOffice { get; set; }

    public virtual SysDocBuilderStatus DocblpStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocblpUpdatedByNavigation { get; set; }
}
