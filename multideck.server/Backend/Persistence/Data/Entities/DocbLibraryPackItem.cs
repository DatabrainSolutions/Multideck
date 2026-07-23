using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbLibraryPackItem
{
    public Guid DocblpiId { get; set; }

    public Guid DocblpiLibraryPackId { get; set; }

    public Guid? DocblpiLibraryDocumentId { get; set; }

    public Guid? DocblpiTemplateId { get; set; }

    public Guid? DocblpiDocTypeId { get; set; }

    public string DocblpiDocumentCode { get; set; } = null!;

    public string DocblpiDocumentName { get; set; } = null!;

    public string DocblpiDataScopeCode { get; set; } = null!;

    public string DocblpiDefaultOutputFormatCode { get; set; } = null!;

    public bool DocblpiIsRequired { get; set; }

    public bool DocblpiIsGeneratedByDefault { get; set; }

    public int DocblpiSortOrder { get; set; }

    public string DocblpiModeCodesJson { get; set; } = null!;

    public string DocblpiDirectionCodesJson { get; set; } = null!;

    public string DocblpiConditionJson { get; set; } = null!;

    public string DocblpiMetadataJson { get; set; } = null!;

    public DateTime DocblpiCreatedAt { get; set; }

    public Guid? DocblpiCreatedBy { get; set; }

    public virtual CmpUser? DocblpiCreatedByNavigation { get; set; }

    public virtual SysDocBuilderDataScope DocblpiDataScopeCodeNavigation { get; set; } = null!;

    public virtual SysDocBuilderOutputFormat DocblpiDefaultOutputFormatCodeNavigation { get; set; } = null!;

    public virtual SysDocType? DocblpiDocType { get; set; }

    public virtual DocbLibraryDocument? DocblpiLibraryDocument { get; set; }

    public virtual DocbLibraryPack DocblpiLibraryPack { get; set; } = null!;

    public virtual DocbDocumentTemplate? DocblpiTemplate { get; set; }
}
