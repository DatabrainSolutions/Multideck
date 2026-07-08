using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbLibraryDocument
{
    public Guid DocbldId { get; set; }

    public string DocbldCode { get; set; } = null!;

    public string DocbldName { get; set; } = null!;

    public string? DocbldCategory { get; set; }

    public string DocbldDataScopeCode { get; set; } = null!;

    public Guid? DocbldDocTypeId { get; set; }

    public string DocbldDefaultRenderEngineCode { get; set; } = null!;

    public string DocbldDefaultOutputFormatCode { get; set; } = null!;

    public string DocbldStatusCode { get; set; } = null!;

    public string? DocbldPurpose { get; set; }

    public string DocbldSourceTablesJson { get; set; } = null!;

    public string DocbldStandardSectionCodesJson { get; set; } = null!;

    public string DocbldSupportedModeCodesJson { get; set; } = null!;

    public string DocbldSupportedDirectionCodesJson { get; set; } = null!;

    public string DocbldCountryCodesJson { get; set; } = null!;

    public bool DocbldIsLegalDocument { get; set; }

    public bool DocbldRequiresJobDocumentLink { get; set; }

    public string? DocbldRetentionCategory { get; set; }

    public string DocbldMetadataJson { get; set; } = null!;

    public bool DocbldIsSystem { get; set; }

    public bool DocbldIsUserEditable { get; set; }

    public bool DocbldIsActive { get; set; }

    public DateTime DocbldCreatedAt { get; set; }

    public Guid? DocbldCreatedBy { get; set; }

    public DateTime DocbldUpdatedAt { get; set; }

    public Guid? DocbldUpdatedBy { get; set; }

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbLibraryPackItem> DocbLibraryPackItems { get; set; } = new List<DocbLibraryPackItem>();

    public virtual CmpUser? DocbldCreatedByNavigation { get; set; }

    public virtual SysDocBuilderDataScope DocbldDataScopeCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderOutputFormat DocbldDefaultOutputFormatCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderRenderEngine DocbldDefaultRenderEngineCodeNavigation { get; set; } = null!;

    public virtual SysDocType? DocbldDocType { get; set; }

    public virtual SysDocBuilderStatus DocbldStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocbldUpdatedByNavigation { get; set; }
}
