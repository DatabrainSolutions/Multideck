using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbSectionLayoutBlock
{
    public Guid DocbslbId { get; set; }

    public Guid DocbslbCellId { get; set; }

    public string DocbslbBlockTypeCode { get; set; } = null!;

    public int DocbslbSortOrder { get; set; }

    public string? DocbslbDisplayLabel { get; set; }

    public Guid? DocbslbFieldCatalogId { get; set; }

    public Guid? DocbslbClauseId { get; set; }

    public Guid? DocbslbAssetId { get; set; }

    public Guid? DocbslbNestedSectionId { get; set; }

    public string? DocbslbSecurityMarkTypeCode { get; set; }

    public string DocbslbContentJson { get; set; } = null!;

    public string DocbslbBindingJson { get; set; } = null!;

    public string DocbslbStyleJson { get; set; } = null!;

    public string DocbslbConditionJson { get; set; } = null!;

    public string DocbslbValidationJson { get; set; } = null!;

    public bool DocbslbIsRequired { get; set; }

    public DateTime DocbslbCreatedAt { get; set; }

    public Guid? DocbslbCreatedBy { get; set; }

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();

    public virtual DocbAssetLibrary? DocbslbAsset { get; set; }

    public virtual SysDocBuilderBlockType DocbslbBlockTypeCodeNavigation { get; set; } = null!;

    public virtual DocbSectionLayoutCell DocbslbCell { get; set; } = null!;

    public virtual DocbClauseLibrary? DocbslbClause { get; set; }

    public virtual CmpUser? DocbslbCreatedByNavigation { get; set; }

    public virtual DocbFieldCatalog? DocbslbFieldCatalog { get; set; }

    public virtual DocbSectionDefinition? DocbslbNestedSection { get; set; }

    public virtual SysDocumentSecurityMarkType? DocbslbSecurityMarkTypeCodeNavigation { get; set; }
}
