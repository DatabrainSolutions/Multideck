using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbDocumentTemplate
{
    public Guid DocbtId { get; set; }

    public string DocbtCode { get; set; } = null!;

    public string DocbtName { get; set; } = null!;

    public Guid? DocbtLibraryDocumentId { get; set; }

    public string? DocbtLibraryDocumentCode { get; set; }

    public Guid? DocbtDocTypeId { get; set; }

    public string? DocbtDocTypeCodeSnapshot { get; set; }

    public string DocbtDataScopeCode { get; set; } = null!;

    public Guid? DocbtDefaultDataSourceId { get; set; }

    public string DocbtStatusCode { get; set; } = null!;

    public int DocbtCurrentVersionNo { get; set; }

    public string DocbtDefaultRenderEngineCode { get; set; } = null!;

    public string DocbtDefaultOutputFormatCode { get; set; } = null!;

    public Guid? DocbtThemeId { get; set; }

    public Guid? DocbtOrgOfficeId { get; set; }

    public Guid? DocbtLegalEntityId { get; set; }

    public Guid? DocbtBrandId { get; set; }

    public Guid? DocbtCustomerOrgId { get; set; }

    public string DocbtLanguageCode { get; set; } = null!;

    public string? DocbtDescription { get; set; }

    public string DocbtSettingsJson { get; set; } = null!;

    public bool DocbtIsSystem { get; set; }

    public bool DocbtIsUserEditable { get; set; }

    public bool DocbtIsActive { get; set; }

    public DateTime DocbtCreatedAt { get; set; }

    public Guid? DocbtCreatedBy { get; set; }

    public DateTime DocbtUpdatedAt { get; set; }

    public Guid? DocbtUpdatedBy { get; set; }

    public virtual ICollection<CommMessageTemplateVersion> CommMessageTemplateVersions { get; set; } = new List<CommMessageTemplateVersion>();

    public virtual ICollection<DocbGeneratedDocument> DocbGeneratedDocuments { get; set; } = new List<DocbGeneratedDocument>();

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual ICollection<DocbRenderJob> DocbRenderJobs { get; set; } = new List<DocbRenderJob>();

    public virtual ICollection<DocbTemplateQarun> DocbTemplateQaruns { get; set; } = new List<DocbTemplateQarun>();

    public virtual ICollection<DocbTemplateVersion> DocbTemplateVersions { get; set; } = new List<DocbTemplateVersion>();

    public virtual CmpBrand? DocbtBrand { get; set; }

    public virtual CmpUser? DocbtCreatedByNavigation { get; set; }

    public virtual OrgMaster? DocbtCustomerOrg { get; set; }

    public virtual SysDocBuilderDataScope DocbtDataScopeCodeNavigation { get; set; } = null!;

    public virtual DocbDataSource? DocbtDefaultDataSource { get; set; }

    public virtual SysDocBuilderOutputFormat DocbtDefaultOutputFormatCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderRenderEngine DocbtDefaultRenderEngineCodeNavigation { get; set; } = null!;

    public virtual SysDocType? DocbtDocType { get; set; }

    public virtual CmpLegalEntity? DocbtLegalEntity { get; set; }

    public virtual DocbLibraryDocument? DocbtLibraryDocument { get; set; }

    public virtual CmpOffice? DocbtOrgOffice { get; set; }

    public virtual SysDocBuilderStatus DocbtStatusCodeNavigation { get; set; } = null!;

    public virtual DocbTheme? DocbtTheme { get; set; }

    public virtual CmpUser? DocbtUpdatedByNavigation { get; set; }
}
