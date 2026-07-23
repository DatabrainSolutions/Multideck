using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbDataSource
{
    public Guid DocbdsId { get; set; }

    public string DocbdsCode { get; set; } = null!;

    public string DocbdsName { get; set; } = null!;

    public string DocbdsDataScopeCode { get; set; } = null!;

    public string? DocbdsDescription { get; set; }

    public string? DocbdsSourceTable { get; set; }

    public string? DocbdsSourceView { get; set; }

    public string DocbdsJsonschema { get; set; } = null!;

    public string DocbdsSampleJson { get; set; } = null!;

    public bool DocbdsIsSystem { get; set; }

    public bool DocbdsIsActive { get; set; }

    public DateTime DocbdsCreatedAt { get; set; }

    public Guid? DocbdsCreatedBy { get; set; }

    public virtual ICollection<DocbDocumentTemplate> DocbDocumentTemplates { get; set; } = new List<DocbDocumentTemplate>();

    public virtual ICollection<DocbFieldCatalog> DocbFieldCatalogs { get; set; } = new List<DocbFieldCatalog>();

    public virtual ICollection<DocbSectionDefinition> DocbSectionDefinitions { get; set; } = new List<DocbSectionDefinition>();

    public virtual CmpUser? DocbdsCreatedByNavigation { get; set; }

    public virtual SysDocBuilderDataScope DocbdsDataScopeCodeNavigation { get; set; } = null!;
}
